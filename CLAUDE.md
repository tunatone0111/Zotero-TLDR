# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Zotero TLDR is a Zotero 7/8 plugin that fetches "TL;DR" summaries from the Semantic Scholar API for research papers and displays them in Zotero's item detail pane. It uses a bootstrap plugin architecture compatible with Zotero 7.x and 8.x.

## Build & Development Commands

- `npm start` - Start dev server with hot-reload (watches src/ and addon/)
- `npm run build` - Production build (generates XPI file in build/)
- `npm run lint` - Run prettier + eslint
- `npm run release` - Create a versioned release via release-it

No test suite exists (`npm test` is a no-op).

## Architecture

**Entry flow**: `addon/bootstrap.js` loads on Zotero startup, waits for initialization, then loads the compiled JS bundle which calls `src/index.ts` -> creates `Addon` instance -> `hooks.onStartup()`.

**Key source files**:

- `src/hooks.ts` - Central lifecycle dispatcher. Handles startup/shutdown, window load/unload, item notifications, and coordinates TLDR fetching with progress UI. Contains `onUpdateItems()` which orchestrates the fetch queue with 50ms throttling between API calls.
- `src/modules/tldrFetcher.ts` - Core logic: queries Semantic Scholar REST API by paper title, uses Longest Common Subsequence (LCS) algorithm with 90% similarity threshold to match results, creates Zotero note items with TLDR content.
- `src/modules/dataStorage.ts` - Generic JSON file persistence layer (`Data<K,V>` class). Stores item-key-to-TLDR-note-key mappings in Zotero's profile directory. `DataStorage` singleton manages instances.
- `src/modules/Common.ts` - Factory classes for UI registration (`UIFactory`: context menus, item pane section) and event registration (`RegisterFactory`: Zotero.Notifier for item add/delete).
- `src/addon.ts` - Plugin root object holding state (alive flag, environment, ztoolkit instance).

**Build system** (`scripts/`): Uses esbuild for TS compilation and `compressing` for XPI packaging. Template variables (`__buildVersion__`, `__author__`, etc.) in source/addon files are replaced at build time via `replace-in-file`.

**Localization**: Uses Fluent (.ftl) format in `addon/locale/{en-US,zh-CN}/`. Build script prefixes keys with the addon ref.

## Plugin Config (from package.json)

- Addon ID: `zoterotldr@syt.com`
- Addon ref (used as prefix): `zoterotldr`
- Prefs prefix: `extensions.zotero.zoterotldr`

## Style Notes

- Do not use long-hyphen (--)
- TypeScript strict mode is enabled
- ESLint + Prettier configured; lint before committing
