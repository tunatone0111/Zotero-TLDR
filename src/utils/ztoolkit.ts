import {
  ZoteroToolkit,
  BasicTool,
  UITool,
  unregister,
} from "zotero-plugin-toolkit";
import { config } from "../../package.json";

export function createZToolkit(): ZoteroToolkit {
  const _ztoolkit = new ZoteroToolkit();
  initZToolkit(_ztoolkit);
  return _ztoolkit;
}

function initZToolkit(_ztoolkit: ReturnType<typeof createZToolkit>) {
  const isDev = __env__ === "development";
  _ztoolkit.basicOptions.log.prefix = `[${config.addonName}]`;
  _ztoolkit.basicOptions.log.disableConsole = !isDev;
  _ztoolkit.UI.basicOptions.ui.enableElementJSONLog = isDev;
  _ztoolkit.UI.basicOptions.ui.enableElementDOMLog = isDev;
  _ztoolkit.basicOptions.debug.disableDebugBridgePassword = isDev;
  _ztoolkit.basicOptions.api.pluginID = config.addonID;
  _ztoolkit.ProgressWindow.setIconURI(
    "default",
    `chrome://${config.addonRef}/content/icons/favicon.png`,
  );
}

class MyToolkit extends BasicTool {
  UI: UITool;

  constructor() {
    super();
    this.UI = new UITool(this);
  }

  unregisterAll() {
    unregister(this);
  }
}
