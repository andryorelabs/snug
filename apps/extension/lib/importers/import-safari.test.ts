// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { resetFakeI18n } from "@/lib/testing/fake-i18n";

import { isSafariExport, parseSafari } from "./import-safari";

beforeEach(() => {
  resetFakeI18n();
});

const wrap = (body: string) => `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
${body}
</DL><p>`;

const SAFARI_EXPORT = wrap(`
  <DT><H3>Favorites</H3>
  <DL><p>
    <DT><A HREF="https://fav.example/">Fav</A>
  </DL><p>
  <DT><H3>Reading List</H3>
  <DL><p>
    <DT><A HREF="https://read.example/">Read</A>
  </DL><p>`);

describe("isSafariExport", () => {
  it("detects a Favorites-first export without a toolbar marker", () => {
    expect(isSafariExport(SAFARI_EXPORT)).toBe(true);
  });

  it("detects a top-level Reading List", () => {
    expect(
      isSafariExport(
        wrap('<DT><H3>Reading List</H3><DL><p><DT><A HREF="https://a.example/">A</A></DL><p>'),
      ),
    ).toBe(true);
  });

  it("rejects an export carrying the toolbar marker", () => {
    expect(
      isSafariExport(wrap('<DT><H3 PERSONAL_TOOLBAR_FOLDER="true">Favorites</H3><DL><p></DL><p>')),
    ).toBe(false);
  });

  it("rejects a Favorites folder that is not first and has no Reading List", () => {
    expect(
      isSafariExport(wrap("<DT><H3>Work</H3><DL><p></DL><p><DT><H3>Favorites</H3><DL><p></DL><p>")),
    ).toBe(false);
  });

  it("rejects exports with no Safari folders at all", () => {
    expect(isSafariExport(wrap("<DT><H3>Work</H3><DL><p></DL><p>"))).toBe(false);
  });
});

describe("parseSafari", () => {
  it("turns Favorites into the bar and keeps Reading List in Other", () => {
    const tree = parseSafari(SAFARI_EXPORT);

    const bar = tree.find((node) => node.isBookmarksBar);
    const other = tree.find((node) => node.isOtherBookmarks);
    expect(bar?.children?.map((child) => child.title)).toEqual(["Fav"]);
    expect(other?.children?.map((child) => child.title)).toEqual(["Reading List"]);
    expect(tree.filter((node) => node.isOtherBookmarks)).toHaveLength(1);
  });

  it("omits Other when Favorites was its only content", () => {
    const tree = parseSafari(
      wrap('<DT><H3>Favorites</H3><DL><p><DT><A HREF="https://fav.example/">Fav</A></DL><p>'),
    );

    expect(tree.some((node) => node.isBookmarksBar)).toBe(true);
    expect(tree.some((node) => node.isOtherBookmarks)).toBe(false);
  });

  it("returns the plain parse when there is no Favorites folder", () => {
    const tree = parseSafari(
      wrap('<DT><H3>Work</H3><DL><p><DT><A HREF="https://w.example/">W</A></DL><p>'),
    );

    expect(tree.some((node) => node.isBookmarksBar)).toBe(false);
    expect(tree.find((node) => node.isOtherBookmarks)?.children).toHaveLength(1);
  });
});
