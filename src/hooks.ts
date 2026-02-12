import { RegisterFactory, UIFactory } from "./modules/Common";
import { config } from "../package.json";
import { getString, initLocale } from "./utils/locale";
import { registerPrefsScripts } from "./modules/preferenceScript";
import { createZToolkit } from "./utils/ztoolkit";
import { tldrs } from "./modules/dataStorage";
import { TLDRFetcher, FetchResult } from "./modules/tldrFetcher";

async function onStartup(): Promise<void> {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  // TODO: Remove this after zotero#3387 is merged
  if (__env__ === "development") {
    ztoolkit.log(`Plugin ${config.addonID} startup`);
  }

  initLocale();

  await tldrs.getAsync();

  RegisterFactory.registerNotifier();

  await onMainWindowLoad(window);
}

async function onMainWindowLoad(win: Window): Promise<void> {
  addon.data.ztoolkit = createZToolkit();

  (win as any).MozXULElement.insertFTLIfNeeded(
    `${config.addonRef}-mainWindow.ftl`,
  );

  UIFactory.registerRightClickMenuItem();
  UIFactory.registerRightClickCollectionMenuItem();
  UIFactory.registerTLDRItemBoxRow();

  fetchAllLibraryItems();
}

async function onMainWindowUnload(_win: Window): Promise<void> {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
}

function onShutdown(): void {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
  addon.data.alive = false;
  delete Zotero[config.addonInstance];
}

async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
): Promise<void> {
  Zotero.log(`${event} ${type} ${ids}, ${extraData}`);
  if (type !== "item" || ids.length === 0) return;

  if (event === "add") {
    onNotifyAddItems(ids);
  } else if (event === "delete") {
    onNotifyDeleteItems(ids);
  }
}

async function onPrefsEvent(
  type: string,
  data: { [key: string]: any },
): Promise<void> {
  if (type === "load") {
    registerPrefsScripts(data.window);
  }
}

async function fetchAllLibraryItems(): Promise<void> {
  const items: Zotero.Item[] = [];
  for (const lib of Zotero.Libraries.getAll()) {
    const libItems = await Zotero.Items.getAll(lib.id);
    for (const item of libItems) {
      if (item.isRegularItem()) {
        items.push(item);
      }
    }
  }
  onUpdateItems(items, false);
}

function onNotifyDeleteItems(ids: (string | number)[]): void {
  tldrs.modify((data) => {
    for (const id of ids) {
      delete data[id];
    }
    return data;
  });
}

async function onNotifyAddItems(ids: (string | number)[]): Promise<void> {
  const regularItems: Zotero.Item[] = [];
  for (const id of ids) {
    const item = Zotero.Items.get(id);
    if (item.isRegularItem()) {
      regularItems.push(item);
    }
  }
  await Zotero.Promise.delay(3000);
  onUpdateItems(regularItems, false);
}

function truncateTitle(title: string, maxLen = 40): string {
  if (title.length <= maxLen) return title;
  return title.slice(0, maxLen) + "...";
}

const SLOT_COUNT = 4;

function onUpdateItems(items: Zotero.Item[], forceFetch: boolean = false) {
  const filtered = items.filter((item) => {
    if (!item.getField("title")) return false;
    if (!forceFetch && item.key in tldrs.get()) return false;
    return true;
  });
  if (filtered.length === 0) return;

  processItemQueue(filtered);
}

async function processItemQueue(items: Zotero.Item[]): Promise<void> {
  const count = items.length;
  const popupWin = new ztoolkit.ProgressWindow(config.addonName, {
    closeOnClick: true,
  });

  popupWin.createLine({
    text: formatSummary(count, 0, 0),
    type: "default",
    progress: 0,
  });

  for (let i = 0; i < SLOT_COUNT; i++) {
    popupWin.createLine({ text: " ", type: "default" });
  }

  popupWin.show(-1);

  const slots: Array<{ text: string; type: string }> = Array.from(
    { length: SLOT_COUNT },
    () => ({ text: " ", type: "default" }),
  );

  function shiftSlots(): void {
    for (let i = 0; i < SLOT_COUNT - 1; i++) {
      slots[i] = slots[i + 1];
      popupWin.changeLine({
        idx: i + 1,
        text: slots[i].text,
        type: slots[i].type as any,
      });
    }
  }

  function setCurrentSlot(text: string, type: string = "default"): void {
    slots[SLOT_COUNT - 1] = { text, type };
    popupWin.changeLine({ idx: SLOT_COUNT, text, type: type as any });
  }

  const phaseLabels: Record<string, string> = {
    match: getString("popWindow-matching"),
    search: getString("popWindow-searching"),
  };

  let succeed = 0;
  let failed = 0;

  for (const [index, item] of items.entries()) {
    const title = truncateTitle(
      (item.getField("title") as string) || "Untitled",
    );

    shiftSlots();
    setCurrentSlot(`${getString("popWindow-fetching")}: ${title}`);

    const result: FetchResult = await new TLDRFetcher(item).fetchTLDR(
      (phase) => {
        const label = phaseLabels[phase];
        if (label) setCurrentSlot(`${label}: ${title}`);
      },
    );

    if (result.status === "found") {
      succeed++;
      setCurrentSlot(`${getString("popWindow-found")}: ${title}`, "success");
    } else {
      failed++;
      setCurrentSlot(`${getString("popWindow-notfound")}: ${title}`, "fail");
    }

    const waiting = count - index - 1;
    const progress = ((index + 1) * 100) / count;
    popupWin.changeLine({
      idx: 0,
      text: formatSummary(waiting, succeed, failed),
      progress,
    });

    await Zotero.Promise.delay(1000);
  }

  popupWin.changeLine({
    idx: 0,
    type: "success",
    progress: 100,
    text: `${getString("popWindow-succeed")}: ${succeed}; ${getString("popWindow-failed")}: ${failed}`,
  });
  popupWin.startCloseTimer(3000);
}

function formatSummary(
  waiting: number,
  succeed: number,
  failed: number,
): string {
  return `${getString("popWindow-waiting")}: ${waiting}; ${getString("popWindow-succeed")}: ${succeed}; ${getString("popWindow-failed")}: ${failed}`;
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onUpdateItems,
};
