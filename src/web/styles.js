export const STYLES = `
:root {
  --bg: #111217; --surface: #1a1c23; --surface-2: #22252e; --line: #2f323d;
  --text: #e6e6ea; --dim: #9a9cab; --accent: #f2c66b; --accent-ink: #1a1405; --good: #7fd39a;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.6 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
a { color: var(--accent); }
main { max-width: 920px; margin: 0 auto; padding: 0 16px 64px; }
nav.top { position: sticky; top: 0; z-index: 2; background: rgb(17 18 23 / 0.92); backdrop-filter: blur(6px); border-bottom: 1px solid var(--line); }
nav.top div { max-width: 920px; margin: 0 auto; padding: 10px 16px; display: flex; gap: 16px; align-items: center; overflow-x: auto; white-space: nowrap; }
nav.top strong { margin-right: auto; }
nav.top a { color: var(--dim); text-decoration: none; font-size: 14px; }
nav.top a:hover { color: var(--text); }
header.hero { padding: 56px 0 32px; }
header.hero h1 { font-size: clamp(30px, 6vw, 44px); line-height: 1.15; margin: 0 0 12px; }
header.hero p.lead { font-size: 18px; color: var(--dim); max-width: 640px; margin: 0 0 24px; }
.buttons { display: flex; gap: 12px; flex-wrap: wrap; }
.button { display: inline-flex; flex-direction: column; gap: 2px; padding: 12px 18px; border-radius: 10px; text-decoration: none; border: 1px solid var(--line); background: var(--surface); color: var(--text); min-width: 210px; }
.button.primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.button b { font-size: 16px; }
.button small { font-size: 13px; opacity: 0.8; }
.button.disabled { opacity: 0.55; pointer-events: none; }
.meta { color: var(--dim); font-size: 14px; margin-top: 12px; }
section { padding: 32px 0; border-top: 1px solid var(--line); }
section h2 { font-size: 24px; margin: 0 0 16px; }
section h3 { font-size: 17px; margin: 0 0 8px; color: var(--accent); }
.grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; }
.card p { margin: 0 0 8px; }
.card p:last-child { margin-bottom: 0; }
.dim { color: var(--dim); }
ol, ul { padding-left: 22px; margin: 0; }
li { margin: 4px 0; }
code { background: var(--surface-2); padding: 1px 6px; border-radius: 6px; font-size: 14px; }
.notice { background: #1d2a22; border: 1px solid #2f4a39; border-radius: 12px; padding: 16px 18px; }
.release { margin-bottom: 20px; }
.release h3 { display: flex; gap: 10px; align-items: baseline; }
.release h3 span { color: var(--dim); font-weight: 400; font-size: 14px; }
.spaced { margin-top: 24px; }
footer { color: var(--dim); font-size: 14px; padding-top: 24px; border-top: 1px solid var(--line); }
`;
