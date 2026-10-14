// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { printSheets } from "../printSheets";

describe("printSheets", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("prints only the given sheets, with the page's styles, then cleans up", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    document.head.innerHTML = "<style>.sheet { color: green; }</style>";
    const sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.innerHTML = "<style>@page { size: 11in 8.5in; margin: 0; }</style>Schedule";
    document.body.innerHTML = "<nav>App chrome</nav>";
    document.body.appendChild(sheet);

    let printed = null;
    const appendChild = document.body.appendChild.bind(document.body);
    vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
      const result = appendChild(node);
      if (node.tagName === "IFRAME") {
        node.contentWindow.focus = () => {};
        node.contentWindow.print = () => {
          printed = node.contentDocument;
        };
      }
      return result;
    });

    const title = await printSheets([sheet], "Front Desk Schedule");

    expect(title).toBe("Front-Desk-Schedule");
    expect(printed.title).toBe("Front-Desk-Schedule");
    expect(printed.querySelectorAll(".export-print-page .sheet")).toHaveLength(1);
    expect(printed.querySelector("nav")).toBeNull();
    expect(printed.head.innerHTML).toContain(".sheet { color: green; }");
    expect(printed.body.innerHTML).toContain("@page { size: 11in 8.5in; margin: 0; }");

    vi.runAllTimers();
    expect(document.querySelector('iframe[title="Print frame"]')).toBeNull();
  });
});
