import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import App from './App';
import { ToastProvider } from './components/ui';
import './index.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    // Surface the error in the console for debugging; keep the UI readable.
    console.error('SUBSCRIPTION HUB render error:', error);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ fontFamily: 'sans-serif', padding: 40, maxWidth: 560, margin: '10vh auto' }}>
          <h1 style={{ fontSize: 22 }}>Something went wrong</h1>
          <p style={{ color: '#8a7f79' }}>
            The screen failed to load. Please refresh. If it persists, contact support.
          </p>
          <pre style={{ background: '#f6f2ee', padding: 12, borderRadius: 8, overflow: 'auto', fontSize: 12 }}>
            {String(this.state.error && this.state.error.message)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SWRConfig value={{ shouldRetryOnError: false, revalidateIfStale: true }}>
        <ToastProvider>
          <HashRouter>
            <App />
          </HashRouter>
        </ToastProvider>
      </SWRConfig>
    </ErrorBoundary>
  </React.StrictMode>
);
