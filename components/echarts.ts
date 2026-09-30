/* ECharts with only the series, components and features DataVizLab draws with, instead of the whole
   library. A chart type or option added later must be registered here too; the unit tests render every
   chart in the catalog, so a missing piece shows up there. */
import * as echarts from "echarts/core";
import { BarChart, BoxplotChart, CandlestickChart, ChordChart, CustomChart, FunnelChart, GraphChart, HeatmapChart, LineChart, LinesChart, ParallelChart, PieChart, RadarChart, SankeyChart, ScatterChart, SunburstChart, ThemeRiverChart, TreeChart, TreemapChart } from "echarts/charts";
import { AriaComponent, AxisPointerComponent, CalendarComponent, DataZoomComponent, GraphicComponent, GridComponent, LegendComponent, MarkLineComponent, ParallelComponent, PolarComponent, RadarComponent, SingleAxisComponent, TitleComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { LabelLayout, LegacyGridContainLabel, UniversalTransition } from "echarts/features";
import { CanvasRenderer, SVGRenderer } from "echarts/renderers";

echarts.use([
  CanvasRenderer, SVGRenderer,
  BarChart, BoxplotChart, CandlestickChart, ChordChart, CustomChart, FunnelChart, GraphChart, HeatmapChart, LineChart, LinesChart, ParallelChart, PieChart, RadarChart, SankeyChart, ScatterChart, SunburstChart, ThemeRiverChart, TreeChart, TreemapChart,
  AriaComponent, AxisPointerComponent, CalendarComponent, DataZoomComponent, GraphicComponent, GridComponent, LegendComponent, MarkLineComponent, ParallelComponent, PolarComponent, RadarComponent, SingleAxisComponent, TitleComponent, TooltipComponent, VisualMapComponent,
  LabelLayout, LegacyGridContainLabel, UniversalTransition,
]);

export * from "echarts/core";
