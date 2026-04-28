# OCWI Loader

Stable browser loader for the OCWI embeddable widget.

The loader is the short-cache file that customers embed. It loads the real widget runtime from a versioned immutable `ocwi-core` npm CDN URL.

## Customer Snippet

```html
<div id="ocwi-19" class="mount"></div>

<script src="https://cdn.amca.cz/ocwi/loader.js"></script>
<script>
  window.OCWI('#ocwi-19', {
    api: {
      lumaUrl: 'https://luma.amca.cz/api/v1/config/<public-hash>/',
    },
  })
</script>
```

The snippet shape is intentionally the same as the previous `ocwi-core` CDN snippet. Only the first script URL changes.

## How It Works

- `loader.js` contains a build-time `ocwi-core` version.
- In normal classic script usage, it uses `document.write` to load:
  `https://cdn.jsdelivr.net/npm/ocwi-core@<version>/dist/ocwi.min.js`
- Because that inserted script is parser-blocking, the following inline `window.OCWI(...)` still sees the real synchronous OCWI API.
- The loaded core bundle is versioned and immutable; the loader URL is the only file that needs short cache headers.
- If the loader script has a CSP `nonce`, the loader copies it to the inserted core script.

Do not fetch the npm registry from browsers at runtime. That would make the startup path asynchronous and would break the synchronous snippet contract.

## Build

```bash
npm run build
```

By default, build values come from `package.json` under `ocwiLoader`. Release automation can override them:

```bash
OCWI_CORE_VERSION=1.1.2 npm run build
```

The generated artifact is:

```text
dist/loader.js
```

## Runtime Overrides

For debugging or staged rollout, the loader script supports these attributes:

```html
<script
  src="https://cdn.amca.cz/ocwi/loader.js"
  data-ocwi-version="1.1.2"
></script>
```

```html
<script
  src="https://cdn.amca.cz/ocwi/loader.js"
  data-ocwi-src="https://static.example.com/ocwi/ocwi.min.js"
></script>
```

`data-ocwi-src` wins over `data-ocwi-version`.

## Demo

Open `demo/minimal.html` to see the smallest local demo snippet:

```html
<div id="ocwi-demo"></div>

<script src="../dist/loader.js" data-ocwi-version="latest"></script>
<script>
  window.OCWI('#ocwi-demo', {
    api: {
      lumaUrl: 'https://luma.amca.cz/api/v1/config/<public-hash>/',
    },
  })
</script>
```

Open `demo/latest.html` to test the loader against the CDN `latest` dist tag
with a small UI:

```html
<script src="../dist/loader.js" data-ocwi-version="latest"></script>
```

The page accepts a Luma config URL in the UI or as a query parameter:

```text
demo/latest.html?lumaUrl=https%3A%2F%2Fluma.amca.cz%2Fapi%2Fv1%2Fconfig%2F<public-hash>%2F
```

## Diagnostics

The loader exposes:

```js
window.OCWI_LOADER
```

Example fields:

```js
{
  loaderVersion: '0.1.0',
  corePackage: 'ocwi-core',
  coreVersion: '1.1.1',
  coreUrl: 'https://cdn.jsdelivr.net/npm/ocwi-core@1.1.1/dist/ocwi.min.js',
  mode: 'document.write',
  loaded: true
}
```

## Hosting

Host `dist/loader.js` on a controlled URL, for example:

```text
https://cdn.amca.cz/ocwi/loader.js
```

Recommended cache headers for the loader:

```http
Cache-Control: max-age=300, must-revalidate
```

The `ocwi-core@x.y.z` bundle may be cached as immutable because the version is part of the URL.

## Release Flow

1. Publish `ocwi-core@x.y.z`.
2. Update `ocwiLoader.coreVersion` or build with `OCWI_CORE_VERSION=x.y.z`.
3. Run `npm run test`.
4. Deploy `dist/loader.js` to the controlled loader URL.
5. Purge the loader URL on the hosting CDN if needed.

## Luma Snippet Configuration

In `luma-front`, point the existing snippet generator to the loader:

```env
VITE_OCWI_SCRIPT_URL=https://cdn.amca.cz/ocwi/loader.js
```

The generator can keep producing the same HTML structure. Customers only receive the new script URL.
