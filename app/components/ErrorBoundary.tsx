'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className='min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900'>
        <div className='text-center max-w-md p-8'>
          <h1 className='text-2xl font-bold text-gray-900 dark:text-white mb-4'>
            오류가 발생했습니다
          </h1>
          <p className='text-gray-600 dark:text-gray-400 mb-6'>
            {this.state.error?.message || '알 수 없는 오류가 발생했습니다'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className='px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer'
          >
            페이지 새로고침
          </button>
        </div>
      </div>
    );
  }
}
