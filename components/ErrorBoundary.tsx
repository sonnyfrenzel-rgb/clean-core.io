'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import CcButton from '@/components/cc/Button';

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

      // Block D (D.9): a workspace card with the error in its words and icon,
      // not a red slab with a 48 px bubble and a 900-weight headline (§1.1, §1.2).
      return (
        <div
          role="alert"
          className="rounded-cc-card border border-cc-error-border bg-cc-surface p-8 text-center shadow-cc"
        >
          <div className="flex flex-col items-center gap-3">
            <AlertCircle size={20} className="text-cc-error" aria-hidden="true" />
            <h2 className="m-0 cc-text-h2 text-cc-ink">{errorMessage}</h2>
            {details && (
              <p className="m-0 rounded-cc-row border border-cc-error-border bg-cc-error-bg p-3 font-cc-mono cc-text-meta text-cc-error">
                {details}
              </p>
            )}
            {!details && (
              <p className="m-0 mx-auto max-w-md cc-text-body text-cc-ink-muted">
                The application encountered an unexpected error. This might be due to malformed data or a rendering issue.
              </p>
            )}
            <div className="mt-2">
              <CcButton
                variant="primary"
                density="cozy"
                icon={<RefreshCw size={16} aria-hidden="true" />}
                onClick={() => this.setState({ hasError: false })}
              >
                Try Again
              </CcButton>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
