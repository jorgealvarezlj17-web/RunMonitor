import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
          <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-red-100">
            <h2 className="text-2xl font-bold text-red-600 mb-4">Algo salió mal</h2>
            <p className="text-gray-600 mb-6">
              Ha ocurrido un error inesperado. Por favor, intenta recargar la página.
            </p>
            <pre className="bg-gray-100 p-4 rounded-lg text-xs overflow-auto max-h-40 mb-6">
              {this.state.error?.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-red-600 text-white py-3 rounded-xl font-semibold hover:bg-red-700 transition-colors"
            >
              Recargar Aplicación
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
