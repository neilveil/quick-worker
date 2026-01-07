# Quick Worker

Automatic browser file caching implementation for your website/apps with zero configuration.

## Features

-   ⚡ **Instant Page Loads** - Automatic client-side caching for instant page loads after first visit
-   🔄 **Auto Cache Updates** - Hash-based change detection automatically updates cache when files change
-   📴 **Offline Support** - Works without internet connection with graceful offline fallback
-   ⚙️ **Zero Configuration** - Works out of the box with sensible defaults, minimal setup required
-   🎯 **Two Caching Strategies** - Choose between `static` (full app caching) or `runtime` (runtime caching) modes

## Installation

```
npm install quick-worker
```

### Setup

### Setup build command

Append `quick-worker` command after the default build command.

```json
{
    "scripts": {
        "build": "my-build-command && quick-worker"
    }
}
```

Configuration

| Argument       | Type   | Default   | Usage                                |
| -------------- | ------ | --------- | ------------------------------------ |
| --root         | String | `build`   | Build directory path                 |
| --type         | String | `runtime` | `static` or `runtime`                |
| --uncompressed |        | `false`   | Output uncompressed scripts          |
| --debug        |        | `false`   | Add debugging logs in output scripts |

Example

```sh
quick-worker --root ./example --type runtime --uncompressed --debug
```

### Add handler script in `index.html`

```html
<body>
    ...

    <script src="/service-worker-handler.js"></script>
</body>
```

> An empty js file `service-worker-handler.js` can be kept to avoid unwanted 404 error in dev mode.

### Ready event

When the application updates its cache, a page reload will occur to use the latest files. It's recommended for apps to wait for the ready event.

```js
window.addEventListener('QW_READY', () => {
    console.log('Quick Worker ready!')
})
```

> Only occurs when new version of the application is deployed.

### --type: `static` vs `runtime`

-   Apps which can work without internet should use `static` cache else `runtime` cache.
-   Runtime cache app should have offline html file `offline.html` which will be visible when there is not internet connection.

## Custom service worker

Add your custom service worker code in `service-worker-append.js` file.

## Migration from QuickWorker

To stop using `quick-worker`, first remove `quick-worker` command from build script.

To temporarily disable `quick-worker` service worker, update `apphash.json` as:

```json
{ "disable": true }
```

To completely remove service worker from your application, update `apphash.json` as:

```json
{ "unregister": true }
```

## Files

-   `apphash.json` **auto-generated**: Keeps a track of cached files.
-   `service-worker.js` **auto-generated**: Main service worker file.
-   `service-worker-handler.js` **auto-generated**: Setup service worker, responsible for cache rotation & ready event.
-   `service-worker-append.js`: Contains custom code to be appended in the main service worker file.

## Note

-   Avoid using `Cache-Control` header from your server to cache files.
-   When updating or removing QuickWorker, ensure `apphash.json` is updated accordingly; refer to the migration docs above.
-   Waiting for `QW_READY` event is recommended for smooth user experience.
