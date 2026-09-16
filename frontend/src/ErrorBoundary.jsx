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
    console.error('Application render failed:', error, info);
  }
  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="page" role="alert" style={{ padding: 24 }}>
          <div className="card">
            <h2>Something went wrong</h2>
            <p>This view could not be displayed. Your saved data has not been changed.</p>
            <button className="button" onClick={() => window.location.reload()}>Reload the app</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
