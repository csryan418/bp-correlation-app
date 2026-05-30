---
name: feedback-charts-svg-not-recharts
description: Use inline SVG for charts, not Recharts or any charting library — match Dashboard.jsx sparkline pattern
metadata:
  type: feedback
---

Use inline SVG for all charts in this project. Recharts is not installed and the user does not want it. The existing sparkline in Dashboard.jsx uses raw SVG paths with cubic bezier curves — match that approach for all trend charts.

**Why:** No charting library is installed. The project uses hand-rolled SVG.

**How to apply:** Any time a chart/graph is needed, use the SVG + cubic bezier path pattern from Dashboard.jsx's `Sparkline` component. Do not attempt to install or import recharts or any other chart library.
