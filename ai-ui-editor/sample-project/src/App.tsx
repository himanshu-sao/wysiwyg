import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { useState } from 'react';
import reactLogo from './assets/react.svg';
import viteLogo from './assets/vite.svg';
import heroImg from './assets/hero.png';
import './App.css';
import Integrations from './pages/Integrations';
import AutomationStudio from './pages/AutomationStudio';

function App() {
  const [count, setCount] = useState(0);

  return (
    <Router>
      <div className="flex">
        <nav className="w-64 p-6 bg-gray-50 min-h-screen">
          <ul className="space-y-4">
            <li>
              <Link to="/" className="text-indigo-600 hover:text-indigo-800">Home</Link>
            </li>
            <li>
              <Link to="/integrations" className="text-indigo-600 hover:text-indigo-800">Integrations</Link>
            </li>
            <li>
              <Link to="/automation-studio" className="text-indigo-600 hover:text-indigo-800">Automation Studio</Link>
            </li>
          </ul>
        </nav>
        <div className="flex-1">
          <Routes>
            <Route path="/" element={
              <>
                <section id="center">
                  <div className="hero">
                    <img src={heroImg} className="base" width="170" height="179" alt="" />
                    <img src={reactLogo} className="framework" alt="React logo" />
                    <img src={viteLogo} className="vite" alt="Vite logo" />
                  </div>
                  <div>
                    <h1>Get started</h1>
                    <p>
                      Edit <code>src/App.tsx</code> and save to test <code>HMR</code>
                    </p>
                  </div>
                  <button
                    type="button"
                    className="counter"
                    onClick={() => setCount((count) => count + 1)}
                  >
                    Count is {count}
                  </button>
                </section>
                <div className="ticks"></div>
                <section id="next-steps">
                  <div id="docs">
                    <svg className="icon" role="presentation" aria-hidden="true">
                      <use href="/icons.svg#documentation-icon"></use>
                    </svg>
                    <h2>Documentation</h2>
                    <p>Your questions, answered</p>
                    <ul>
                      <li>
                        <a href="https://vite.dev/" target="_blank">
                          <img className="logo" src={viteLogo} alt="" />
                          Explore Vite
                        </a>
                      </li>
                      <li>
                        <a href="https://react.dev/" target="_blank">
                          <img className="button-icon" src={reactLogo} alt="" />
                          Learn more
                        </a>
                      </li>
                    </ul>
                  </div>
                  <div id="social">
                    <svg className="icon" role="presentation" aria-hidden="true">
                      <use href="/icons.svg#social-icon"></use>
                    </svg>
                    <h2>Connect with us</h2>
                    <p>Join the Vite community</p>
                    <ul>
                      <li>
                        <a href="https://github.com/vitejs/vite" target="_blank">
                          <svg
                            className="button-icon"
                            role="presentation"
                            aria-hidden="true"
                          >
                            <use href="/icons.svg#github-icon"></use>
                          </svg>
                          GitHub
                        </a>
                      </li>
                      <li>
                        <a href="https://chat.vite.dev/" target="_blank">
                          <svg
                            className="button-icon"
                            role="presentation"
                            aria-hidden="true"
                          >
                            <use href="/icons.svg#discord-icon"></use>
                          </svg>
                          Discord
                        </a>
                      </li>
                      <li>
                        <a href="https://x.com/vite_js" target="_blank">
                          <svg
                            className="button-icon"
                            role="presentation"
                            aria-hidden="true"
                          >
                            <use href="/icons.svg#x-icon"></use>
                          </svg>
                          X.com
                        </a>
                      </li>
                      <li>
                        <a href="https://bsky.app/profile/vite.dev" target="_blank">
                          <svg
                            className="button-icon"
                            role="presentation"
                            aria-hidden="true"
                          >
                            <use href="/icons.svg#bluesky-icon"></use>
                          </svg>
                          Bluesky
                        </a>
                      </li>
                    </ul>
                  </div>
                </section>
                <div className="ticks"></div>
                <section id="spacer"></section>
              </>
            } />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/automation-studio" element={<AutomationStudio />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;