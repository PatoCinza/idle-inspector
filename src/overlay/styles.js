export const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; }
.panel {
  position: fixed; top: 72px; right: 12px; z-index: 2147483647;
  width: min(780px, calc(100vw - 16px)); max-height: min(72vh, 680px);
  display: flex; flex-direction: column;
  background: rgba(17, 18, 23, 0.95); color: #e6e6ea;
  border: 1px solid #3b3d48; border-radius: 8px;
  font: 12px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
}
.panel.collapsed { width: auto; }
.panel.collapsed .body { display: none; }
.bar {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 6px 8px 6px 12px; cursor: grab; user-select: none;
  border-bottom: 1px solid #2c2e38;
}
.panel.collapsed .bar { border-bottom: 0; }
.bar strong { font-size: 12px; letter-spacing: 0.02em; }
.ghost {
  all: unset; cursor: pointer; padding: 2px 8px; border-radius: 4px; color: #b9bac4;
}
.ghost:hover, .ghost:focus-visible { background: #2a2c36; color: #fff; }
.ghost[disabled] { cursor: progress; opacity: 0.6; }
.actions { display: flex; align-items: center; gap: 4px; }
.body { display: flex; flex-direction: column; min-height: 0; padding: 8px 12px 10px; gap: 6px; }
.status { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; color: #c7c8d1; }
.since { color: #8d8f9c; }
.scroll { overflow: auto; min-height: 0; border: 1px solid #2c2e38; border-radius: 6px; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 4px 7px; text-align: left; white-space: nowrap; }
th {
  position: sticky; top: 0; background: #1d1f27; color: #b9bac4; font-weight: 600;
  cursor: pointer; user-select: none; border-bottom: 1px solid #2c2e38;
}
th:not([data-sort]) { cursor: default; }
th[data-sort]:hover, th:focus-visible { color: #fff; outline: none; }
th.active { color: #f2c66b; }
.n { text-align: right; font-variant-numeric: tabular-nums; }
tbody tr:nth-child(even) { background: rgba(255, 255, 255, 0.025); }
tbody tr:hover { background: rgba(255, 255, 255, 0.06); }
td.item { display: flex; align-items: center; gap: 8px; }
td.creatures { max-width: 150px; overflow: hidden; text-overflow: ellipsis; color: #9a9cab; }
.icon { width: 28px; height: 28px; image-rendering: pixelated; flex: none; }
.icon.empty { display: inline-block; background: #242631; border-radius: 4px; }
.dim { color: #6f7180; }
.waiting { margin: 6px 0; color: #c7c8d1; }
.warn { margin: 0; color: #e7b75a; }
.notice { margin: 0; }
.notice.ok { color: #7fd39a; }
.total { margin: 0; font-weight: 600; }
.tabs { display: flex; gap: 2px; }
.tab { all: unset; cursor: pointer; padding: 3px 10px; border-radius: 4px; color: #9a9cab; }
.tab:hover, .tab:focus-visible { background: #2a2c36; color: #fff; }
.tab.active { background: #2f3140; color: #f2c66b; }
.meter { display: block; width: 90px; height: 6px; background: #242631; border-radius: 3px; overflow: hidden; }
.meter > span { display: block; height: 100%; background: #6fb5ff; }
.pill.good { color: #7fd39a; }
.plans h3 { margin: 8px 8px 4px; font-size: 12px; }
.plans table { margin-bottom: 4px; }
.status-pill { margin-left: 8px; font-weight: 400; color: #c7c8d1; }
tr.bottleneck { background: rgba(242, 198, 107, 0.1); }
.foot { margin: 0; color: #8d8f9c; font-size: 11px; }
`;
