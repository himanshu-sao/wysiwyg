import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import DevToolsPanel from './DevToolsPanel';

const root = createRoot(document.getElementById('root')!);
root.render(<DevToolsPanel />);