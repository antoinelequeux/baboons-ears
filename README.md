# Baboons Ears Field Trainer

Offline-first PWA built from the `BaboonsEars.zip` export.

## What is included

- `index.html`, `style.css`, `app.js`
- `manifest.json` and `service-worker.js`
- `data/individuals.json`
- `images/` copied from the original export
- `scripts/build_dataset.py` to regenerate the dataset if the export changes

## Rebuild from the export

From the project root:

```bash
python3 scripts/build_dataset.py
```

## Publish on GitHub Pages

Push this folder to a GitHub repository, then enable GitHub Pages from the repository settings.

## Install on phone

1. Open the deployed site once while online.
2. Wait for the first load to finish.
3. Add it to the home screen.
4. Open it again from the icon before going offline.
