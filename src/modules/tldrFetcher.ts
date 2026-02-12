import { tldrs } from "./dataStorage";

export type FetchResult = {
  status: "found" | "not_found" | "error";
  phase?: "match" | "search";
};

type SemanticScholarItemInfo = {
  title?: string;
  abstract?: string;
  tldr?: string;
};

const API_BASE = "https://api.semanticscholar.org/graph/v1";
const FIELDS = "title,abstract,tldr";

export class TLDRFetcher {
  private readonly zoteroItem: Zotero.Item;
  private readonly title?: string;
  private readonly abstract?: string;

  constructor(item: Zotero.Item) {
    this.zoteroItem = item;
    if (item.isRegularItem()) {
      this.title = item.getField("title") as string;
      this.abstract = item.getField("abstractNote") as string;
    }
  }

  async fetchTLDR(
    onPhase?: (phase: "match" | "search") => void,
  ): Promise<FetchResult> {
    if (!this.title) {
      return { status: "not_found" };
    }
    const noteKey = (await tldrs.getAsync())[this.zoteroItem.key];
    try {
      onPhase?.("match");
      const matchItem = await this.fetchMatchItem(this.title);
      if (
        matchItem?.title &&
        matchItem.tldr &&
        this.isSimilar(matchItem.title, this.title)
      ) {
        await this.saveTLDR(matchItem.tldr, noteKey);
        return { status: "found", phase: "match" };
      }

      onPhase?.("search");
      const searchItems = await this.fetchSearchItems(this.title);
      for (const info of searchItems) {
        if (!info.tldr) continue;

        const titleMatch =
          info.title && this.isSimilar(info.title, this.title);
        const abstractMatch =
          info.abstract &&
          this.abstract &&
          this.isSimilar(info.abstract, this.abstract);

        if (titleMatch || abstractMatch) {
          await this.saveTLDR(info.tldr, noteKey);
          return { status: "found", phase: "search" };
        }
      }

      await tldrs.modify((data: any) => {
        data[this.zoteroItem.key] = false;
        return data;
      });
      return { status: "not_found" };
    } catch (error) {
      Zotero.log(`Semantic Scholar API request error: ${error}`);
      return { status: "error" };
    }
  }

  private async saveTLDR(
    tldrText: string,
    noteKey: string | false | undefined,
  ): Promise<void> {
    let note = new Zotero.Item("note");
    if (noteKey) {
      const obj = Zotero.Items.getByLibraryAndKey(
        this.zoteroItem.libraryID,
        noteKey,
      );
      if (
        obj &&
        obj instanceof Zotero.Item &&
        this.zoteroItem.getNotes().includes(obj.id)
      ) {
        note = obj;
      }
    }
    note.setNote(`<p>TL;DR</p>\n<p>${tldrText}</p>`);
    note.parentID = this.zoteroItem.id;
    await note.saveTx();
    await tldrs.modify((data: any) => {
      data[this.zoteroItem.key] = note.key;
      return data;
    });
  }

  private async fetchMatchItem(
    title: string,
  ): Promise<SemanticScholarItemInfo | null> {
    const url = `${API_BASE}/paper/search/match?query=${encodeURIComponent(title)}&fields=${FIELDS}`;
    try {
      const resp = await Zotero.HTTP.request("GET", url, {
        successCodes: [200, 404],
      });
      if (resp.status === 200) {
        const json = JSON.parse(resp.response);
        const item = json.data?.[0];
        if (item) {
          return {
            title: item.title,
            abstract: item.abstract,
            tldr: item.tldr?.text,
          };
        }
      }
    } catch (error) {
      Zotero.log(`search/match request failed: ${error}`);
    }
    return null;
  }

  private async fetchSearchItems(
    title: string,
  ): Promise<SemanticScholarItemInfo[]> {
    const url = `${API_BASE}/paper/search?query=${encodeURIComponent(title)}&fields=${FIELDS}&limit=5`;
    try {
      const resp = await Zotero.HTTP.request("GET", url);
      if (resp.status === 200) {
        const json = JSON.parse(resp.response);
        const data = json.data ?? [];
        return data.map((item: any) => ({
          title: item.title,
          abstract: item.abstract,
          tldr: item.tldr?.text,
        }));
      }
    } catch (error) {
      Zotero.log(`search request failed: ${error}`);
    }
    return [];
  }

  private isSimilar(a: string, b: string): boolean {
    const lcsLen = lcsLength(a, b);
    return lcsLen >= Math.max(a.length, b.length) * 0.9;
  }
}

function lcsLength(text1: string, text2: string): number {
  const m = text1.length;
  const n = text2.length;

  // Use a single rolling row to save memory
  const prev = new Array<number>(n + 1).fill(0);
  const curr = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (text1[i - 1] === text2[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    for (let j = 0; j <= n; j++) {
      prev[j] = curr[j];
      curr[j] = 0;
    }
  }

  return prev[n];
}
