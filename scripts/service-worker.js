const debug = false
const isStatic = false

const CACHE_VERSION = 'v1'
const CACHE_NAMES = {
    STATIC: `QSW-STATIC-${CACHE_VERSION}`,
    RUNTIME: `QSW-RUNTIME-${CACHE_VERSION}`
}

const offlineHTML = '/offline.html'

self.addEventListener('install', event =>
    event.waitUntil(
        (async () => {
            print('INSTALLING')

            let precacheFiles = []

            if (isStatic) {
                try {
                    const response = await fetch('/apphash.json?' + Date.now())
                    if (!response.ok) {
                        throw new Error(`apphash.json fetch failed: ${response.status} ${response.statusText}`)
                    }
                    const data = await response.json()
                    if (validateApphash(data) && Array.isArray(data.files) && data.files.length) {
                        precacheFiles = data.files
                        print('APPHASH-LOADED ::', data.files.length, 'files')
                    } else {
                        throw new Error('Invalid apphash.json structure')
                    }
                } catch (error) {
                    print('APPHASH-FETCH-ERROR ::', error.message || error, error.stack)
                    // Continue installation even if apphash.json fails
                    // Fallback to runtime mode behavior
                    precacheFiles = [offlineHTML]
                }
            } else {
                precacheFiles = [offlineHTML]
            }

            // Cache all files
            if (precacheFiles.length > 0) {
                try {
                    const cache = await caches.open(CACHE_NAMES.STATIC)
                    await cache.addAll(precacheFiles)
                } catch (error) {
                    print('CACHE-ERROR ::', error.message || error, 'Attempting individual cache')
                    // Continue installation even if some files fail to cache
                    // Cache files individually to avoid complete failure
                    const cache = await caches.open(CACHE_NAMES.STATIC)
                    const cachePromises = precacheFiles.map(async file => {
                        try {
                            await cache.add(file)
                            print('CACHED-FILE ::', file)
                        } catch (fileError) {
                            print('FAILED-TO-CACHE ::', file, fileError.message || fileError)
                        }
                    })
                    const results = await Promise.allSettled(cachePromises)
                    const failed = results.filter(r => r.status === 'rejected').length
                    if (failed > 0) {
                        print('CACHE-PARTIAL ::', failed, 'of', precacheFiles.length, 'files failed')
                    }
                }
            }

            // Initialize runtime cache for runtime mode (ensures cache exists even if empty)
            if (!isStatic) {
                try {
                    await caches.open(CACHE_NAMES.RUNTIME)
                    print('RUNTIME-CACHE-INITIALIZED')
                } catch (error) {
                    print('RUNTIME-CACHE-INIT-ERROR ::', error.message || error)
                }
            }

            print('SKIP_WAIT_TIME')
            await self.skipWaiting()

            print('INSTALLED')
        })()
    )
)

self.addEventListener('activate', event =>
    event.waitUntil(
        (async () => {
            print('ACTIVATING')

            // Clean up old caches (only our own, not all caches)
            // Only delete caches that don't match the current version
            const currentCacheNames = [CACHE_NAMES.STATIC, CACHE_NAMES.RUNTIME]
            const cacheKeys = await caches.keys()
            const deletePromises = cacheKeys
                .filter(key => {
                    // Delete caches that match our pattern but are not the current version
                    // Cache names are prefixed with 'QSW-STATIC-' and 'QSW-RUNTIME-'
                    const isOurCache =
                        (key.startsWith('QSW-STATIC-') || key.startsWith('QSW-RUNTIME-')) &&
                        !currentCacheNames.includes(key)
                    return isOurCache
                })
                .map(key => {
                    print('DELETING-CACHE ::', key)
                    return caches.delete(key)
                })
            await Promise.all(deletePromises)

            // Register self
            await self.clients.claim()
            print('CLAIMED_SELF')

            // Enable navigation preload (if supported)
            if (self.registration.navigationPreload) {
                try {
                    await self.registration.navigationPreload.enable()
                    print('PRELOAD_ENABLED')
                } catch (error) {
                    print('PRELOAD-ERROR ::', error)
                }
            }

            print('ACTIVATED')
        })()
    )
)

self.addEventListener('fetch', event =>
    event.respondWith(
        (async () => {
            const request = event.request
            print('FETCH ::', request.url, request.method)

            // Don't cache non-GET requests
            if (request.method !== 'GET') {
                return fetch(request)
            }

            // Don't cache external resources for security
            if (!isSameOrigin(request.url)) {
                print('EXTERNAL-REQUEST ::', request.url, 'bypassing cache')
                return fetch(request)
            }

            // Don't cache requests with sensitive headers
            if (hasSensitiveHeaders(request)) {
                print('SENSITIVE-HEADERS ::', request.url, 'bypassing cache')
                return fetch(request)
            }

            try {
                // For runtime mode, check RUNTIME cache first, then STATIC cache
                // For static mode, check STATIC cache first
                let cachedResponse = null

                if (!isStatic) {
                    // Runtime mode: check RUNTIME cache first
                    const runtimeCache = await caches.open(CACHE_NAMES.RUNTIME)
                    cachedResponse = await runtimeCache.match(request, {
                        ignoreSearch: false,
                        ignoreMethod: false,
                        ignoreVary: false
                    })
                    // Fallback to ignoring query params
                    if (!cachedResponse) {
                        cachedResponse = await runtimeCache.match(request, {
                            ignoreSearch: true,
                            ignoreMethod: false,
                            ignoreVary: false
                        })
                    }
                }

                // If not found in RUNTIME (or in static mode), check STATIC cache
                if (!cachedResponse) {
                    const staticCache = await caches.open(CACHE_NAMES.STATIC)
                    cachedResponse = await staticCache.match(request, {
                        ignoreSearch: false,
                        ignoreMethod: false,
                        ignoreVary: false
                    })
                    // Fallback to ignoring query params
                    if (!cachedResponse) {
                        cachedResponse = await staticCache.match(request, {
                            ignoreSearch: true,
                            ignoreMethod: false,
                            ignoreVary: false
                        })
                    }
                }

                if (cachedResponse) {
                    print('SERVED-FROM-CACHE ::', request.url)
                    return cachedResponse
                }

                // Use preload if possible
                const preloadResponse = await event.preloadResponse
                if (preloadResponse) {
                    print('PRELOAD ::', request.url)
                    // Cache preload response in runtime cache for runtime mode
                    if (!isStatic && isSameOrigin(request.url) && !hasSensitiveHeaders(request)) {
                        try {
                            const preloadClone = preloadResponse.clone()
                            const cache = await caches.open(CACHE_NAMES.RUNTIME)
                            await cache.put(request, preloadClone)
                            print('CACHED-PRELOAD ::', request.url)
                        } catch (cacheError) {
                            print('CACHE-PRELOAD-ERROR ::', request.url, cacheError.message || cacheError)
                        }
                    }
                    return preloadResponse
                }

                // Else go to network
                const networkResponse = await fetch(request)

                // Cache response in runtime cache if it's successful (runtime mode only)
                // Note: isSameOrigin and hasSensitiveHeaders already checked above
                if (!isStatic && networkResponse.ok && networkResponse.status === 200) {
                    const destination = request.destination || ''
                    const contentType = networkResponse.headers.get('content-type') || ''
                    const responseType = networkResponse.type

                    print(
                        'EVALUATING-CACHE ::',
                        request.url,
                        'type:',
                        responseType,
                        'contentType:',
                        contentType,
                        'destination:',
                        destination
                    )

                    // Determine if this should be cached
                    // Cache assets (scripts, styles, images, fonts, etc.) and HTML pages
                    const isAsset = ['font', 'image', 'script', 'style', 'audio', 'video', 'track'].includes(
                        destination
                    )
                    const isHtmlPage =
                        request.mode === 'navigate' || destination === 'document' || contentType.startsWith('text/html')
                    const matchesFileExtension = request.url.match(
                        /\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot|ico|webp|avif|html|htm|json|xml|txt)$/i
                    )
                    const matchesContentType = contentType.match(
                        /^(text\/(html|css|javascript|plain|xml|json)|application\/(javascript|json|xml)|image\/|font\/|audio\/|video\/)/i
                    )

                    const shouldCache = isAsset || isHtmlPage || matchesFileExtension || matchesContentType

                    // Cache everything that matches criteria, ignore Cache-Control headers
                    // Service worker manages its own cache lifecycle
                    print('CACHE-DECISION ::', request.url, 'shouldCache:', shouldCache, 'responseType:', responseType)

                    if (shouldCache) {
                        // Only cache if response is cloneable (basic or cors responses)
                        if (responseType === 'basic' || responseType === 'cors') {
                            try {
                                const responseClone = networkResponse.clone()
                                const cache = await caches.open(CACHE_NAMES.RUNTIME)
                                await cache.put(request, responseClone)
                                print('✅ CACHED ::', request.url, contentType || destination || 'unknown')
                            } catch (cacheError) {
                                print(
                                    '❌ CACHE-PUT-ERROR ::',
                                    request.url,
                                    cacheError.message || cacheError,
                                    cacheError.stack
                                )
                                // Continue even if caching fails
                            }
                        } else {
                            print(
                                '⚠️ NOT-CACHED-OPAQUE ::',
                                request.url,
                                'responseType:',
                                responseType,
                                '(only basic/cors can be cached)'
                            )
                        }
                    } else {
                        print(
                            '⚠️ NOT-CACHED ::',
                            request.url,
                            'shouldCache:',
                            shouldCache,
                            'shouldNotCache:',
                            shouldNotCache
                        )
                    }
                } else if (!isStatic) {
                    print(
                        '⚠️ NOT-CACHED-STATUS ::',
                        request.url,
                        'ok:',
                        networkResponse.ok,
                        'status:',
                        networkResponse.status
                    )
                }

                print('SERVED-FROM-NETWORK ::', request.url)
                return networkResponse
            } catch (error) {
                print('NETWORK-ERROR ::', request.url, error.message || error, error.stack)

                // For navigation requests, serve offline page
                if (request.mode === 'navigate') {
                    try {
                        const cache = await caches.open(CACHE_NAMES.STATIC)
                        const cachedResponse = await cache.match(offlineHTML)

                        if (cachedResponse) {
                            print('SERVED-OFFLINE-CONTENT ::', request.url)
                            return cachedResponse
                        }
                    } catch (cacheError) {
                        print('OFFLINE-CACHE-ERROR ::', cacheError.message || cacheError)
                    }
                }

                // For other requests, try to serve from cache as fallback
                if (request.mode !== 'navigate' && isSameOrigin(request.url)) {
                    try {
                        // Try exact match first, then fallback to ignoring query params
                        let cachedResponse = await caches.match(request, {
                            ignoreSearch: false,
                            ignoreMethod: false,
                            ignoreVary: false
                        })
                        if (!cachedResponse) {
                            cachedResponse = await caches.match(request, {
                                ignoreSearch: true,
                                ignoreMethod: false,
                                ignoreVary: false
                            })
                        }
                        if (cachedResponse) {
                            print('SERVED-FROM-CACHE-FALLBACK ::', request.url)
                            return cachedResponse
                        }
                    } catch (cacheError) {
                        print('CACHE-FALLBACK-ERROR ::', cacheError.message || cacheError)
                    }
                }

                print('RESOURCE-NOT-FOUND ::', request.url)
                return new Response('Resource unavailable', {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: {
                        'Content-Type': 'text/plain',
                        'Cache-Control': 'no-store'
                    }
                })
            }
        })()
    )
)

const print = (...content) => debug && console.log('QSW ::', ...content)

// Helper function to check if request is from same origin
const isSameOrigin = url => {
    try {
        const requestUrl = new URL(url, self.location.href)
        return requestUrl.origin === self.location.origin
    } catch {
        return false
    }
}

// Helper function to check if request has sensitive headers
const hasSensitiveHeaders = request => {
    const sensitiveHeaders = ['authorization', 'cookie', 'x-csrf-token', 'x-requested-with']
    for (const header of sensitiveHeaders) {
        if (request.headers.has(header)) {
            return true
        }
    }
    return false
}

// Helper function to validate apphash.json structure
const validateApphash = data => {
    if (!data || typeof data !== 'object') {
        return false
    }
    // In static mode, files array is required
    if (isStatic) {
        if (!Array.isArray(data.files) || !data.files.every(f => typeof f === 'string')) {
            return false
        }
    }
    // Hash is always required
    if (typeof data.hash !== 'string') {
        return false
    }
    return true
}
