import React from 'react';
import { Welcome } from './components/Welcome';
import { SignUp } from './components/SignUp';
import { SignIn } from './components/SignIn';
import { AdminSignIn } from './components/AdminSignIn';
import { StudentDashboard } from './components/StudentDashboard';
import { AdminDashboard } from './components/AdminDashboard';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, errorInfo) { console.error('ErrorBoundary caught:', error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center p-8 bg-white rounded-xl shadow-lg">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h1>
            <button onClick={() => window.location.reload()} className="btn-primary">Reload Page</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [currentView, setCurrentView] = React.useState('loading');

  React.useEffect(() => {
    // Initial load logic
    const hasVisited = localStorage.getItem('hashreports_visited');
    const savedView = sessionStorage.getItem('hashreports_view');

    let initialView = 'welcome';

    if (hasVisited) {
        if (savedView && savedView !== 'welcome') {
            initialView = savedView;
        } else {
            initialView = 'signin';
        }
    } else {
        localStorage.setItem('hashreports_visited', 'true');
        if (savedView) {
            initialView = savedView;
        }
    }

    if (window.location.hash) {
        const hashView = window.location.hash.substring(1);
        if (['signin', 'signup', 'admin-signin', 'welcome'].includes(hashView)) {
            if (hasVisited && hashView === 'welcome') {
                initialView = 'signin';
            } else {
                initialView = hashView;
            }
        }
    }

    setCurrentView(initialView);
    window.history.replaceState({ view: initialView }, '', `#${initialView}`);

    const handlePopState = (event) => {
        if (event.state && event.state.view) {
            setCurrentView(event.state.view);
            sessionStorage.setItem('hashreports_view', event.state.view);
        }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const changeView = (view, replace = false) => {
      sessionStorage.setItem('hashreports_view', view);
      if (replace) {
          window.history.replaceState({ view }, '', `#${view}`);
      } else {
          window.history.pushState({ view }, '', `#${view}`);
      }
      setCurrentView(view);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGetStarted = () => {
      localStorage.setItem('hashreports_visited', 'true');
      changeView('signup');
  };

  const handleNavigate = (view) => {
      changeView(view);
  };

  const handleLoginSuccess = (role) => {
      changeView(role === 'admin' ? 'admin-dashboard' : 'student-dashboard');
  };

  const handleLogout = () => {
      changeView('signin');
  };

  if (currentView === 'loading') return <div className="min-h-screen flex items-center justify-center"><div className="icon-loader animate-spin text-4xl text-[var(--primary-color)]"></div></div>;

  return (
    <div data-name="app" data-file="App.jsx">
        {currentView === 'welcome' && <Welcome onGetStarted={handleGetStarted} onSignIn={() => handleNavigate('signin')} />}
        {currentView === 'signup' && <SignUp onNavigate={handleNavigate} />}
        {currentView === 'signin' && <SignIn onNavigate={handleNavigate} onLoginSuccess={handleLoginSuccess} />}
        {currentView === 'admin-signin' && <AdminSignIn onNavigate={handleNavigate} onLoginSuccess={handleLoginSuccess} />}
        {currentView === 'student-dashboard' && <StudentDashboard onLogout={handleLogout} />}
        {currentView === 'admin-dashboard' && <AdminDashboard onLogout={handleLogout} />}
    </div>
  );
}

export { ErrorBoundary };
export default App;
