import {Component, createRef} from 'react';
import type {Theme} from '@emotion/react';
import {withTheme} from '@emotion/react';
import type {PieSeriesOption} from 'echarts';

import type {ReactEchartsRef, Series} from 'sentry/types/echarts';

import Legend from './components/legend';
import PieSeries from './series/pieSeries';
import type {BaseChartProps} from './baseChart';
import BaseChart from './baseChart';

export interface PieChartSeries
  extends Series,
    Omit<PieSeriesOption, 'id' | 'color' | 'data'> {}

interface Props extends Omit<BaseChartProps, 'series'> {
  series: PieChartSeries[];
  theme: Theme;
  selectOnRender?: boolean;
}

class PieChart extends Component<Props> {
  componentDidMount() {
    const {selectOnRender} = this.props;

    if (!selectOnRender) {
      return;
    }

    // Timeout is because we need to wait for rendering animation to complete
    // And I haven't found a callback for this
    this.highlightTimeout = window.setTimeout(() => this.highlight(0), 1000);
  }

  componentWillUnmount() {
    window.clearTimeout(this.highlightTimeout);
  }

  highlightTimeout: number | undefined = undefined;
  isInitialSelected = true;
  selected = 0;
  chart = createRef<ReactEchartsRef>();

  // Select a series to highlight (e.g. shows details of series)
  // This is the same event as when you hover over a series in the chart
  highlight = (dataIndex: any) => {
    if (!this.chart.current) {
      return;
    }

    this.chart.current.getEchartsInstance().dispatchAction({
      type: 'highlight',
      seriesIndex: 0,
      dataIndex,
    });
  };

  // Opposite of `highlight`
  downplay = (dataIndex: any) => {
    if (!this.chart.current) {
      return;
    }

    this.chart.current.getEchartsInstance().dispatchAction({
      type: 'downplay',
      seriesIndex: 0,
      dataIndex,
    });
  };

  // echarts Legend does not have access to percentages (but tooltip does :/)
  getSeriesPercentages = (series: PieChartSeries) => {
    const total = series.data.reduce((acc, {value}) => acc + value, 0);
    return series.data
      .map(({name, value}) => [name, Math.round((value / total) * 10000) / 100])
      .reduce(
        (acc, [name, value]) => ({
          ...acc,
          [name!]: value,
        }),
        {}
      );
  };

  render() {
    const {series, theme, ...props} = this.props;
    if (!series?.length) {
      return null;
    }
    if (series.length > 1) {
      // eslint-disable-next-line no-console
      console.warn('PieChart only uses the first series!');
    }

    // Note, we only take the first series unit!
    const [firstSeries] = series;
    const seriesPercentages: Record<string, unknown> = this.getSeriesPercentages(
      firstSeries!
    );

    return (
      <BaseChart
        ref={this.chart}
        colors={
          firstSeries?.data &&
          theme.chart.getColorPalette(firstSeries.data.length).slice()
        }
        // when legend highlights it does NOT pass dataIndex :(
        onHighlight={({name}) => {
          if (
            !this.isInitialSelected ||
            !name ||
            firstSeries!.data[this.selected]!.name === name
          ) {
            return;
          }

          // Unhighlight if not initial "highlight" event and
          // if name exists (i.e. not dispatched from cDM) and
          // highlighted series name is different than the initially selected series name
          this.downplay(this.selected);
          this.isInitialSelected = false;
        }}
        onMouseOver={({dataIndex}) => {
          if (!this.isInitialSelected) {
            return;
          }
          if (dataIndex === this.selected) {
            return;
          }
          this.downplay(this.selected);
          this.isInitialSelected = false;
        }}
        {...props}
        legend={Legend({
          theme,
          orient: 'vertical',
          align: 'left',
          show: true,
          left: 10,
          top: 10,
          bottom: 10,
          formatter: name =>
            `${name} ${
              typeof seriesPercentages[name] === 'undefined'
                ? ''
                : `(${seriesPercentages[name]}%)`
            }`,
        })}
        tooltip={{
          formatter: data => {
            return [
              '<div class="tooltip-series">',
              `<div><span class="tooltip-label">${(data as any).marker}<strong>${(data as any).name}</strong></span> ${(data as any).percent}%</div>`,
              '</div>',
              `<div class="tooltip-footer">${(data as any).value}</div>`,
              '</div>',
              '<div class="tooltip-arrow"></div>',
            ].join('');
          },
        }}
        series={[
          PieSeries({
            name: firstSeries!.seriesName,
            data: firstSeries!.data,
            avoidLabelOverlap: false,
            label: {
              formatter: ({name, percent}) => `${name}\n${percent}%`,
              show: false,
              position: 'center',
              fontSize: '18',
            },
            emphasis: {
              label: {
                show: true,
              },
            },
            labelLine: {
              show: false,
            },
          }),
        ]}
        xAxis={null}
        yAxis={null}
      />
    );
  }
}

export default withTheme(PieChart);
