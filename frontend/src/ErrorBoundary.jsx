import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Adapter crash:', error, info);
  }
  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div style={{ padding: 16, border: '1px solid #f00', background: '#fff5f5' }}>
          <strong>Adapter exploded:</strong>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{String(error?.stack || error)}</pre>
          <button onClick={() => this.setState({ error: null })}>Reset</button>
        </div>
      );
    }
    return this.props.children;
  }
}
