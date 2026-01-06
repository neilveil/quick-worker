window.addEventListener('load', async () => {
    // Check if service workers are supported
    if (!('serviceWorker' in navigator)) {
        console.warn('Service workers are not supported in this browser')
        return
    }

    try {
        const response = await fetch('/apphash.json?' + Date.now())
        if (!response.ok) {
            console.error('Failed to fetch apphash.json:', response.status, response.statusText)
            return
        }

        const apphashJSON = await response.json()

        const newHash = apphashJSON.hash
        const disable = apphashJSON.disable
        const unregister = apphashJSON.unregister

        if (disable) return
        if (unregister) {
            await window.unregisterServiceWorker()
            return // unregisterServiceWorker will reload the page
        }

        // Validate hash exists
        if (!newHash || typeof newHash !== 'string') {
            console.error('Invalid apphash.json: hash is missing or invalid')
            return
        }

        const currentHash = window.localStorage.getItem('QSW_APPHASH')

        // If hash changed, unregister old service worker first (will reload page)
        if (currentHash && newHash !== currentHash) {
            await window.unregisterServiceWorker()
            return // unregisterServiceWorker will reload the page
        }

        // Register new service worker
        await window.navigator.serviceWorker
            .register('/service-worker.js')
            .then(() => {
                window.localStorage.setItem('QSW_APPHASH', newHash)
                window.dispatchEvent(new Event('QSW_READY'))
            })
            .catch(error => {
                console.error('Failed to register service worker:', error)
            })
    } catch (error) {
        console.error('service-worker-handler-error', error)
    }
})

window.unregisterServiceWorker = async () => {
    // Only delete our own caches, not all caches
    // Cache names are prefixed with 'QSW-STATIC-' and 'QSW-RUNTIME-'
    await caches.keys().then(keys => {
        return Promise.all(
            keys
                .filter(key => key.startsWith('QSW-STATIC-') || key.startsWith('QSW-RUNTIME-'))
                .map(key => caches.delete(key))
        )
    })

    const registrations = await window.navigator.serviceWorker.getRegistrations()
    for (const registration of registrations) {
        await registration.unregister()
    }
    window.localStorage.removeItem('QSW_APPHASH')
    window.location.reload()
}
