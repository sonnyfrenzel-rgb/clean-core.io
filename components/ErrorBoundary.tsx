'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      let errorMessage = "The application encountered an unexpected error. This might be due to malformed data or a rendering issue.";
      let details = "";

      if (this.state.error?.message && this.state.error.message.includes('{')) {
        try {
          const errInfo = JSON.parse(this.state.error.message);
          if (errInfo.error && errInfo.operationType) {
            errorMessage = `Firestore ${errInfo.operationType.toUpperCase()} Error`;
            details = `${errInfo.error}. Path: ${errInfo.path || 'N/A'}`;
          }
        } catch (e) {
          // Not a JSON error
        }
      }

      return (
        <div className="p-12 text-center bg-red-50 rounded-[3rem] border border-red-100 shadow-inner">
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 bg-red-100 rounded-full text-red-600">
              <AlertCircle size={48} />
            </div>
            <h2 className="text-2xl font-black text-red-900 tracking-tight">{errorMessage}</h2>
            {details && <p className="text-red-600 font-mono text-xs bg-white/50 p-3 rounded-xl border border-red-100">{details}</p>}
            <p className="text-red-700 font-medium max-w-md mx-auto">
              {!details && "The application encountered an unexpected error. This might be due to malformed data or a rendering issue."}
            </p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="mt-4 flex items-center gap-2 bg-red-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg"
            >
              <RefreshCw size={20} /> Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
