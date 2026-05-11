import { SVGIcon } from "../utils/config";
import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { getPref, setPref } from "../utils/prefs";
import { addTranslateTask, getLastTranslateTask } from "../utils/task";
import { slice } from "../utils/str";
import { renderMarkdown } from "../utils/markdownRenderer";

export function updateReaderPopup() {
  const popup = addon.data.popup.currentPopup;
  if (!popup) {
    return;
  }
  const enablePopup = getPref("enablePopup");
  const hidePopupTextarea = getPref("enableHidePopupTextarea") as boolean;
  Array.from(popup.querySelectorAll(`.${config.addonRef}-readerpopup`)).forEach(
    (elem) => ((elem as HTMLElement).hidden = !enablePopup),
  );

  const idPrefix = popup?.getAttribute(`${config.addonRef}-prefix`);
  const makeId = (type: string) => `${idPrefix}-${type}`;
  const audiobox = popup?.querySelector(
    `#${makeId("audiobox")}`,
  ) as HTMLDivElement;
  const translateButton = popup?.querySelector(
    `#${makeId("translate")}`,
  ) as HTMLDivElement;
  const textarea = popup?.querySelector(
    `#${makeId("text")}`,
  ) as HTMLTextAreaElement;
  const renderedDiv = popup?.querySelector(
    `#${makeId("rendered-text")}`,
  ) as HTMLDivElement;
  const addToNoteButton = popup?.querySelector(
    `#${makeId("addtonote")}`,
  ) as HTMLDivElement;

  const updateHidden = (elem: HTMLElement, hidden: boolean) => {
    if (hidden) {
      elem.style.display = "none";
    } else {
      elem.style.removeProperty("display");
    }
  };

  if (!enablePopup) {
    updateHidden(audiobox, true);
    updateHidden(translateButton, true);
    updateHidden(textarea, true);
    updateHidden(renderedDiv, true);
    updateHidden(addToNoteButton, true);
    return;
  }
  const task = getLastTranslateTask({ type: "text" });
  if (!task) {
    return;
  }
  popup.setAttribute("translate-task-id", task.id);

  if (task.audio.length > 0 && getPref("showPlayBtn")) {
    audiobox.innerHTML = "";
    updateHidden(audiobox, false);
    ztoolkit.UI.appendElement(
      {
        tag: "fragment",
        children: task.audio.map((audioData) => ({
          tag: "button",
          namespace: "html",
          classList: ["toolbar-button", "wide-button"],
          attributes: {
            tabindex: "-1",
            title: audioData.text,
          },
          properties: {
            innerHTML: `🔊 ${audioData.text}`,
            onclick: () => {
              new (ztoolkit.getGlobal("Audio"))(audioData.url).play();
            },
          },
          styles: { whiteSpace: "nowrap", flexGrow: "1" },
        })),
      },
      audiobox,
    );
  }

  if (task.audio.length > 0 && getPref("showPlayBtn") && getPref("autoPlay")) {
    const firstAudio = task.audio[0];
    const audio = new (ztoolkit.getGlobal("Audio"))(firstAudio.url);
    audio.play();
  }

  const hideTranslateButton = task.status !== "waiting";
  updateHidden(translateButton, hideTranslateButton);

  switch (task.langto?.split("-")[0]) {
    case "ar":
    case "fa":
    case "he":
      textarea.style.direction = "rtl";
      renderedDiv.style.direction = "rtl";
      break;
    default:
      textarea.style.direction = "ltr";
      renderedDiv.style.direction = "ltr";
  }

  const mdEnabled = getPref("enableMarkdownRendering") as boolean;
  const mathEnabled = getPref("enableMathRendering") as boolean;
  const shouldRender = (mdEnabled || mathEnabled) && task.status === "success";

  textarea.value = task.result || task.raw;
  textarea.style.fontSize = `${getPref("fontSize")}px`;
  textarea.style.lineHeight = `${
    Number(getPref("lineHeight")) * Number(getPref("fontSize"))
  }px`;

  const enableAddToNote = getPref("enableNote") as boolean;
  if (
    !Zotero.getMainWindow().ZoteroContextPane.activeEditor ||
    !enableAddToNote
  ) {
    updateHidden(addToNoteButton, true);
  }

  // Always use the plain textarea to calculate the natural popup size
  textarea.hidden = false;
  textarea.style.removeProperty("display");
  updateHidden(renderedDiv, true);

  updatePopupSize(popup, textarea);

  // Now apply the computed size to renderedDiv if needed, and toggle visibility
  if (shouldRender) {
    renderedDiv.innerHTML = renderMarkdown(task.result, renderedDiv.ownerDocument);
    renderedDiv.style.fontSize = `${getPref("fontSize")}px`;
    renderedDiv.style.lineHeight = `${
      Number(getPref("lineHeight")) * Number(getPref("fontSize"))
    }px`;
    
    // Copy the calculated width
    renderedDiv.style.width = textarea.style.width;
    
    updateHidden(renderedDiv, false);
    textarea.hidden = true;
    textarea.style.display = "none";
  } else {
    textarea.hidden = hidePopupTextarea || !hideTranslateButton;
  }

  const finalizePopupLayout = () => {
    const win = popup.ownerGlobal;
    const viewportHeight = win ? win.innerHeight : popup.ownerDocument.documentElement.clientHeight;
    // Cap at 45% to ensure it never overflows even with other popup buttons
    const maxHeight = viewportHeight * 0.45; 
    const keepSize = getPref("keepPopupSize") as boolean;

    if (shouldRender) {
      if (!keepSize) {
        renderedDiv.style.height = "auto"; // Temporarily auto to get true scrollHeight
        const renderedHeight = renderedDiv.scrollHeight;
        const finalHeight = Math.min(renderedHeight + 3, maxHeight);
        renderedDiv.style.height = `${Math.max(finalHeight, 30)}px`;
      } else {
        renderedDiv.style.height = `${Math.max(Number(getPref("popupHeight")) || 30, 30)}px`;
      }
    } else {
      if (!keepSize) {
        const finalHeight = Math.min(textarea.scrollHeight + 3, maxHeight);
        textarea.style.height = `${Math.max(finalHeight, 30)}px`;
      }
    }

    // Adjust popup position if it overflows the screen boundaries
    const rect = popup.getBoundingClientRect();
    const currentTop = parseFloat(popup.style.top) || 0;
    
    // Bottom collision check
    if (rect.bottom > viewportHeight - 20) {
      const overflow = rect.bottom - (viewportHeight - 20);
      popup.style.top = `${currentTop - overflow}px`;
    }
    
    // Top collision check (run after bottom check to ensure top visibility takes priority)
    const newRect = popup.getBoundingClientRect();
    if (newRect.top < 20) {
      const topOverflow = 20 - newRect.top;
      const finalTop = currentTop + (parseFloat(popup.style.top) - currentTop) + topOverflow;
      // More simply: just shift it down by how much it's above the top safe zone
      const currentShiftedTop = parseFloat(popup.style.top) || 0;
      popup.style.top = `${currentShiftedTop + topOverflow}px`;
    }
  };

  finalizePopupLayout();

  // Re-adjust after web fonts (like KaTeX math fonts) finish loading
  if (shouldRender && popup.ownerDocument.fonts) {
    popup.ownerDocument.fonts.ready.then(() => {
      finalizePopupLayout();
    });
  }
}

export function buildReaderPopup(
  event: _ZoteroTypes.Reader.EventParams<"renderTextSelectionPopup">,
) {
  const { reader, doc, append } = event;
  
  if (!doc.getElementById(`${config.addonRef}-katex-style`)) {
    const link = doc.createElement("link");
    link.id = `${config.addonRef}-katex-style`;
    link.rel = "stylesheet";
    link.href = `chrome://${config.addonRef}/content/styles/katex.min.css`;
    doc.head.appendChild(link);
  }
  
  if (!doc.getElementById(`${config.addonRef}-math-textbox-style`)) {
    const link = doc.createElement("link");
    link.id = `${config.addonRef}-math-textbox-style`;
    link.rel = "stylesheet";
    link.href = `chrome://${config.addonRef}/content/styles/mathTextbox.css`;
    doc.head.appendChild(link);
  }

  const annotation = event.params.annotation;
  const popup = doc.querySelector(".selection-popup") as HTMLDivElement;
  addon.data.popup.currentPopup = popup;
  popup.style.maxWidth = "none";
  popup.setAttribute(
    `${config.addonRef}-prefix`,
    `${config.addonRef}-${reader._instanceID}`,
  );

  const ZoteroContextPane = Zotero.getMainWindow().ZoteroContextPane;

  const colors = popup.querySelector(".colors") as HTMLDivElement;
  colors.style.width = "100%";
  colors.style.justifyContent = "space-evenly";

  const keepSize = getPref("keepPopupSize") as boolean;

  const makeId = (type: string) =>
    `${config.addonRef}-${reader._instanceID}-${type}`;
  const onTextAreaCopy = getOnTextAreaCopy(popup, makeId("text"));

  const hidePopupTextarea = getPref("enableHidePopupTextarea") as boolean;
  append(
    ztoolkit.UI.createElement(doc, "fragment", {
      children: [
        {
          tag: "div",
          id: makeId("audiobox"),
          classList: [`${config.addonRef}-readerpopup`],
          styles: {
            display: "flex",
            width: "calc(100% - 4px)",
            marginLeft: "2px",
            justifyContent: "space-evenly",
          },
          ignoreIfExists: true,
        },
        {
          tag: "button",
          namespace: "html",
          id: makeId("translate"),
          classList: [
            "toolbar-button",
            "wide-button",
            `${config.addonRef}-readerpopup`,
          ],
          properties: {
            innerHTML: `${SVGIcon}${getString("readerpopup-translate-label")}`,
            hidden: getPref("enableAuto"),
          },
          listeners: [
            {
              type: "click",
              listener: (ev: Event) => {
                addon.hooks.onTranslate({
                  noCheckZoteroItemLanguage: true,
                  noCache: true,
                });
                const button = ev.target as HTMLDivElement;
                button.hidden = true;
                const mdEnabled = getPref("enableMarkdownRendering") as boolean;
                const mathEnabled = getPref("enableMathRendering") as boolean;
                if (!mdEnabled && !mathEnabled) {
                  (
                    button.ownerDocument.querySelector(
                      `#${makeId("text")}`,
                    ) as HTMLTextAreaElement
                  ).hidden = hidePopupTextarea;
                }
              },
            },
          ],
          ignoreIfExists: true,
        },
        {
          tag: "textarea",
          id: makeId("text"),
          attributes: {
            rows: "3",
            columns: "10",
          },
          classList: [
            `${config.addonRef}-popup-textarea`,
            `${config.addonRef}-readerpopup`,
          ],
          styles: {
            fontSize: `${getPref("fontSize")}px`,
            fontFamily: "inherit",
            lineHeight: `${
              Number(getPref("lineHeight")) * Number(getPref("fontSize"))
            }px`,
            width: keepSize ? `${getPref("popupWidth")}px` : "-moz-available",
            // Minimum width to prevent the textarea from being smaller than the popup
            minWidth: "184px",
            height: `${Math.max(
              keepSize ? Number(getPref("popupHeight")) : 30,
            )}px`,
            marginInline: "2px",
            border: "none",
            background: "var(--color-sidepane)",
            borderRadius: "6px",
            padding: "5px",
          },
          properties: {
            onpointerup: (e: Event) => e.stopPropagation(),
            ondragstart: (e: Event) => e.stopPropagation(),
            spellcheck: false,
            value: addon.data.translate.selectedText,
          },
          ignoreIfExists: true,
          listeners: [
            {
              type: "mousedown",
              listener: (_ev) => {
                _ev.target?.addEventListener(
                  "mousemove",
                  onTextAreaResize as (ev: Event) => void,
                );
              },
            },
            {
              type: "mouseup",
              listener: (_ev) => {
                _ev.target?.removeEventListener(
                  "mousemove",
                  onTextAreaResize as (ev: Event) => void,
                );
              },
            },
            {
              type: "keydown",
              listener: onTextAreaCopy as (ev: Event) => void,
            },
            {
              type: "dblclick",
              listener: (_ev) => {
                const textarea = popup.querySelector(
                  `#${makeId("text")}`,
                ) as HTMLTextAreaElement;
                textarea.selectionStart = 0;
                textarea.selectionEnd = textarea.value.length;
                const text = textarea.value.slice(
                  textarea.selectionStart,
                  textarea.selectionEnd,
                );
                new ztoolkit.Clipboard().addText(text, "text/plain").copy();
                new ztoolkit.ProgressWindow("Copied to Clipboard")
                  .createLine({
                    text: slice(text, 50),
                    progress: 100,
                    type: "default",
                  })
                  .show();
              },
            },
          ],
        },
        {
          tag: "div",
          id: makeId("rendered-text"),
          classList: [
            "math-overlay",
            `${config.addonRef}-readerpopup`,
          ],
          styles: {
            display: "none",
            fontSize: `${getPref("fontSize")}px`,
            fontFamily: "inherit",
            lineHeight: `${
              Number(getPref("lineHeight")) * Number(getPref("fontSize"))
            }px`,
            width: keepSize ? `${getPref("popupWidth")}px` : "-moz-available",
            minWidth: "184px",
            height: `${Math.max(
              keepSize ? Number(getPref("popupHeight")) : 30,
            )}px`,
            marginInline: "2px",
            background: "var(--color-sidepane)",
            borderRadius: "6px",
            padding: "5px",
            overflow: "auto",
            userSelect: "text",
            resize: "both",
          },
          properties: {
            onpointerup: (e: Event) => e.stopPropagation(),
            ondragstart: (e: Event) => e.stopPropagation(),
            onwheel: (e: Event) => e.stopPropagation(),
          },
          listeners: [
            {
              type: "mousedown",
              listener: (_ev) => {
                const elem = _ev.target as HTMLElement;
                elem.dataset.mouseDownX = String((_ev as MouseEvent).clientX);
                elem.dataset.mouseDownY = String((_ev as MouseEvent).clientY);
                elem.addEventListener(
                  "mousemove",
                  onTextAreaResize as (ev: Event) => void,
                );
              },
            },
            {
              type: "mouseup",
              listener: (_ev) => {
                _ev.target?.removeEventListener(
                  "mousemove",
                  onTextAreaResize as (ev: Event) => void,
                );
              },
            },
            {
              type: "click",
              listener: (ev: Event) => {
                const renderedDiv = ev.currentTarget as HTMLDivElement;
                // Don't trigger toggle if clicking on the scrollbar or resize handle
                const rect = renderedDiv.getBoundingClientRect();
                const isScrollbarOrResize = 
                  ((ev as MouseEvent).clientX > rect.right - 20) || 
                  ((ev as MouseEvent).clientY > rect.bottom - 20);
                
                // Allow user to select text without toggling
                // Instead of window.getSelection() which is unreliable across iframes,
                // we check if the mouse moved significantly between mousedown and click.
                const targetElem = ev.target as HTMLElement;
                const downX = Number(targetElem.dataset.mouseDownX || (ev as MouseEvent).clientX);
                const downY = Number(targetElem.dataset.mouseDownY || (ev as MouseEvent).clientY);
                const moveDist = Math.abs((ev as MouseEvent).clientX - downX) + Math.abs((ev as MouseEvent).clientY - downY);
                const isTextSelectionDrag = moveDist > 5;
                
                if (!isScrollbarOrResize && !isTextSelectionDrag) {
                  const textarea = renderedDiv.ownerDocument.querySelector(`#${makeId("text")}`) as HTMLTextAreaElement;
                  renderedDiv.style.display = "none";
                  textarea.style.width = renderedDiv.style.width;
                  textarea.style.height = renderedDiv.style.height;
                  textarea.style.removeProperty("display");
                  textarea.hidden = false;
                  textarea.focus();
                }
              }
            }
          ],
          ignoreIfExists: true,
        },
        {
          tag: "button",
          namespace: "html",
          id: makeId("addtonote"),
          classList: [
            "toolbar-button",
            "wide-button",
            `${config.addonRef}-readerpopup`,
          ],
          styles: {
            marginTop: "8px",
          },
          properties: {
            innerHTML: `${SVGIcon}${getString("readerpopup-addToNote-label")}`,
          },
          ignoreIfExists: true,
          listeners: [
            {
              type: "click",
              listener: async (ev) => {
                const noteEditor =
                  ZoteroContextPane && ZoteroContextPane.activeEditor;
                if (!noteEditor) {
                  return;
                }
                const editorInstance = noteEditor.getCurrentInstance();
                if (!editorInstance) {
                  return;
                }
                const task = addTranslateTask(
                  addon.data.translate.selectedText,
                  reader.itemID,
                  "addtonote",
                );
                if (!task) {
                  return;
                }
                await addon.hooks.onTranslate(task, {
                  noCheckZoteroItemLanguage: true,
                  noDisplay: true,
                });
                if (task.status !== "success") {
                  return;
                }
                const replaceMode = getPref("enableNoteReplaceMode") as boolean;
                if (replaceMode) {
                  annotation.text = task.result;
                } else {
                  annotation.comment = task.result;
                }
                // @ts-ignore should be fixed in the zotero-types
                reader._addToNote([annotation]);
              },
            },
          ],
        },
      ],
    }),
  );
}

function onTextAreaResize(ev: MouseEvent) {
  if (getPref("keepPopupSize")) {
    const textarea = ev.target as HTMLTextAreaElement;
    setPref("popupWidth", textarea.offsetWidth);
    setPref("popupHeight", textarea.offsetHeight);
  }
}

function getOnTextAreaCopy(selectionMenu: HTMLElement, targetId: string) {
  return (ev: KeyboardEvent) => {
    const textarea = selectionMenu.querySelector(
      `#${targetId}`,
    ) as HTMLTextAreaElement;
    const isMod = ev.ctrlKey || ev.metaKey;
    if (ev.key === "c" && isMod) {
      ztoolkit.getGlobal("setTimeout")(() => {
        new ztoolkit.Clipboard()
          .addText(
            textarea.value.slice(
              textarea.selectionStart,
              textarea.selectionEnd,
            ),
            "text/plain",
          )
          .copy();
      }, 10);
      ev.stopPropagation();
    } else if (ev.key === "a" && isMod) {
      textarea.selectionStart = 0;
      textarea.selectionEnd = textarea.value.length;
      ev.stopPropagation();
    } else if (ev.key === "x" && isMod) {
      new ztoolkit.Clipboard()
        .addText(
          textarea.value.slice(textarea.selectionStart, textarea.selectionEnd),
          "text/plain",
        )
        .copy();
      textarea.value = `${textarea.value.slice(
        0,
        textarea.selectionStart,
      )}${textarea.value.slice(textarea.selectionEnd)}`;
      ev.stopPropagation();
    }
  };
}

function updatePopupSize(
  selectionMenu: HTMLDivElement,
  textarea: HTMLElement,
  resetSize: boolean = true,
): void {
  const keepSize = getPref("keepPopupSize") as boolean;
  if (keepSize) {
    return;
  }
  if (resetSize) {
    textarea.style.width = "-moz-available";
    textarea.style.height = "30px";
  }
  const viewer = selectionMenu.ownerDocument.body;
  // Get current H & W
  const textHeight = textarea.scrollHeight;
  const textWidth = textarea.scrollWidth;
  const newWidth = textWidth + 20;
  // Check until H/W<0.75 and don't overflow viewer border
  if (
    textHeight / textWidth > 0.75 &&
    selectionMenu.offsetLeft + newWidth < viewer.offsetWidth
  ) {
    // Update width
    textarea.style.width = `${newWidth}px`;
    updatePopupSize(selectionMenu, textarea, false);
    return;
  }
  // Update height
  textarea.style.height = `${textHeight + 3}px`;
}
