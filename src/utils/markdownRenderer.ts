// @ts-ignore
import { marked } from "../extras/marked";
import { getPref } from "./prefs";
import { renderMathInText, containsMath, MATH_REGEX } from "./mathRenderer";

export function renderMarkdown(text: string, doc: Document = document): string {
  if (!text) return "";
  
  const mathEnabled = getPref("enableMathRendering") as boolean;
  const mdEnabled = getPref("enableMarkdownRendering") as boolean;

  if (!mdEnabled) {
    if (mathEnabled) {
      return renderMathInText(doc, text);
    }
    const div = doc.createElement("div");
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, "<br></br>");
  }

  // If both enabled, we protect math from marked
  if (mathEnabled && containsMath(text)) {
    const mathBlocks: string[] = [];
    
    let placeholderCount = 0;
    // MATH_REGEX captures prefix in group 1 or group 4
    const protectedText = text.replace(MATH_REGEX, (match, p1, p2, p3, p4) => {
      const prefix = p1 || p4 || "";
      const placeholder = `MATHPLACEHOLDER${placeholderCount}MATHPLACEHOLDER`;
      // Store ONLY the math part (without prefix)
      mathBlocks.push(match.slice(prefix.length));
      placeholderCount++;
      return prefix + placeholder;
    });

    let html = marked.parse(protectedText) as string;

    // Restore math
    for (let i = 0; i < mathBlocks.length; i++) {
      const renderedMath = renderMathInText(doc, mathBlocks[i]);
      html = html.replace(`MATHPLACEHOLDER${i}MATHPLACEHOLDER`, renderedMath);
    }
    return html;
  }

  return marked.parse(text) as string;
}
