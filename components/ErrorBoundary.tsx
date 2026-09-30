"use client";

import { Component, type ReactNode } from "react";

type Props = {
  /** What to show instead of the failed part; `retry` renders it again. */
  fallback: (retry: () => void, error: Error) => ReactNode;
  /** When any of these change (new data, another chart type), a failed part tries again on its own. */
  resetKeys?: unknown[];
  children: ReactNode;
};

type State = { error: Error | null; keys: unknown[] };

const changed = (a: unknown[] = [], b: unknown[] = []) => a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]));

/** Contains a failure to the part of the page that failed (a chart fed atypical data, a chunk that did not
 *  download), so the rest of the app keeps working and the person can try again. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, keys: this.props.resetKeys ?? [] };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (state.error && changed(props.resetKeys, state.keys)) return { error: null, keys: props.resetKeys ?? [] };
    if (changed(props.resetKeys, state.keys)) return { keys: props.resetKeys ?? [] };
    return null;
  }

  componentDidCatch(error: Error) {
    console.error("[DataVizLab]", error);
  }

  retry = () => this.setState({ error: null });

  render() {
    return this.state.error ? this.props.fallback(this.retry, this.state.error) : this.props.children;
  }
}
