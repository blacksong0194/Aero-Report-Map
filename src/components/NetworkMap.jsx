import React, { useState, useEffect, useRef, useCallback } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { 
  Network, GitBranch, CircleDot, List, Plus, X, User, FileText, Image, 
  ArrowRight, Download, Brain, ChevronRight, Trash2, Edit, Search,
  Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw, Link2, Users, CheckCircle, AlertTriangle
} from 'lucide-react';
import { findRelatedCases } from '../lib/person-match.js';

// Construye el texto enumerado de casos asociados (informes + vigilancia)
function buildCasesNote(related) {
  const lines = [];
  (related.cases || []).forEach((c, i) => {
    lines.push(`${i + 1}. ${c.label}${c.date ? ` (${c.date})` : ""}${c.area ? " · " + c.area : ""}${c.status ? " · " + c.status : ""}`);
  });
  (related.watch || []).forEach((w) => lines.push(`⚠ Vigilancia: ${w.reason || w.severity || "interés"}`));
  return lines.length ? "Casos asociados:\n" + lines.join("\n") : "";
}

const ROLE_COLORS = {
  líder: '#f59e0b',
  miembro: '#3b82f6',
  sospechoso: '#ef4444',
  corrupción: '#f97316',
  droga: '#10b981',
  tecnología: '#6366f1',
  investigación: '#f97316',
  testigo: '#64748b',
  victima: '#8b5cf6',
  núcleo: '#f59e0b'
};

const ROLE_LABELS = {
  líder: '1 Vinculante',
  miembro: '2 Miembro',
  sospechoso: '3 Sospechoso',
  corrupción: '4 Corrupción',
  droga: '5 Droga',
  tecnología: '6 Tecnología',
  investigación: '7 Investigación',
  testigo: 'Testigo',
  victima: 'Víctima',
  núcleo: '1 Vinculante'
};

const ARROW_STYLES = [
  { name: 'Normal →', style: 'solid', marker: '→' },
  { name: 'Punteado ⤑', style: 'dashed', marker: '⤑' },
  { name: 'Fino ─', style: 'thin', marker: '─' },
  { name: 'Grueso ═', style: 'thick', marker: '═' },
{ name: 'Punto──·', style: 'dotted', marker: '·' },
  { name: 'Doble =', style: 'double', marker: '=' }
];

const S = {
  app: { display: 'flex', height: '100vh', background: '#080c18', color: '#e2e8f0', fontFamily: "'Inter',sans-serif", overflow: 'hidden' },
  sidebar: { width: 220, background: '#0d1426', borderRight: '1px solid #1e2d4a', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  sideHeader: { padding: '20px 16px 12px', borderBottom: '1px solid #1e2d4a' },
  logo: { fontFamily: "'Barlow Condensed',sans-serif", fontSize: 20, fontWeight: 700, color: '#f59e0b', letterSpacing: 1 },
  logoSub: { fontSize: 9, color: '#64748b', letterSpacing: 2, textTransform: 'uppercase', marginTop: 2 },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  topbar: { height: 56, background: '#0d1426', borderBottom: '1px solid #1e2d4a', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0 },
  content: { flex: 1, overflow: 'auto', padding: 20 },
  card: { background: '#0f1629', border: '1px solid #1e2d4a', borderRadius: 12, padding: '16px 20px' },
  h1: { fontFamily: "'Barlow Condensed',sans-serif", fontSize: 22, fontWeight: 700, color: '#f1f5f9', letterSpacing: 0.5 },
  h2: { fontFamily: "'Barlow Condensed',sans-serif", fontSize: 17, fontWeight: 600, color: '#cbd5e1' },
  label: { fontSize: 11, fontWeight: 500, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 },
  badge: c => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: c + '20', color: c, border: '1px solid ' + c + '40' }),
  btn: v => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none', outline: 'none', background: v === 'danger' ? '#ef444420' : v === 'ghost' ? '#1a2a45' : '#f59e0b', color: v === 'danger' ? '#ef4444' : v === 'ghost' ? '#94a3b8' : '#000', transition: 'all 0.15s' }),
  input: { width: '100%', background: '#0b1020', border: '1px solid #1e2d4a', borderRadius: 8, padding: '9px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none', fontFamily: "'Inter',sans-serif" },
  select: { width: '100%', background: '#0b1020', border: '1px solid #1e2d4a', borderRadius: 8, padding: '9px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none', fontFamily: "'Inter',sans-serif" },
  textarea: { width: '100%', background: '#0b1020', border: '1px solid #1e2d4a', borderRadius: 8, padding: '9px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: "'Inter',sans-serif", minHeight: 80 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  flex: { display: 'flex', alignItems: 'center', gap: 12 },
  row: { display: 'flex', alignItems: 'flex-start', gap: 14 },
  sep: { borderTop: '1px solid #1e2d4a', margin: '14px 0' },
  mono: { fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#64748b' }
};

const SAMPLE_NODES = [
  { id: 1, name: 'Carlos Mendoza', role: 'líder', docNumber: '001-2345678-9', photo: null, notes: 'Cabeza de la organización' },
  { id: 2, name: 'Ana Patricia López', role: 'corrupción', docNumber: '001-3456789-0', photo: null, notes: 'Manejo de финансы' },
  { id: 3, name: 'Miguel Ángel Torres', role: 'droga', docNumber: '001-4567890-1', photo: null, notes: 'Jefe de distribución' },
  { id: 4, name: 'Roberto Sánchez', role: 'tecnología', docNumber: '001-5678901-2', photo: null, notes: 'Sistemas de comunicación' },
  { id: 5, name: 'María José Fernández', role: 'investigación', docNumber: '001-6789012-3', photo: null, notes: 'Investigadora de campo' },
  { id: 6, name: 'Pedro Jiménez', role: 'testigo', docNumber: '001-7890123-4', photo: null, notes: 'Testigo clave' },
  { id: 7, name: 'Laura Cristina Ruiz', role: 'droga', docNumber: '001-8901234-5', photo: null, notes: 'Red de distribución' },
  { id: 8, name: 'Jorge Eduardo Díaz', role: 'corrupción', docNumber: '001-9012345-6', photo: null, notes: 'Lavado de activos' }
];

const SAMPLE_CONNECTIONS = [
  { from: 1, to: 2, label: 'Financia' },
  { from: 1, to: 3, label: 'Coordina' },
  { from: 1, to: 4, label: 'Contacto' },
  { from: 2, to: 8, label: 'Lavado' },
  { from: 3, to: 7, label: 'Distribuye' },
  { from: 5, to: 6, label: 'Investiga' },
  { from: 4, to: 1, label: 'Reporta' }
];

// Modal para agregar sucesos
function AddEventModal({ nodes, setEvents, setShowAddEvent, ROLE_COLORS }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedPersons, setSelectedPersons] = useState([]);

  const handleAdd = () => {
    if (!title) return;
    setEvents(prev => [...prev, { 
      id: Date.now(), 
      title, 
      description, 
      date, 
      persons: selectedPersons 
    }]);
    setShowAddEvent(false);
    setTitle('');
    setDescription('');
    setDate(new Date().toISOString().split('T')[0]);
    setSelectedPersons([]);
  };

  const togglePerson = (nodeId) => {
    setSelectedPersons(prev => 
      prev.includes(nodeId) 
        ? prev.filter(id => id !== nodeId)
        : [...prev, nodeId]
    );
  };

  return (
    <div style={{ background: '#0f1629', border: '1px solid #1e2d4a', borderRadius: 12, padding: 24, width: 450, maxHeight: '80vh', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={S.h2}>Agregar Suceso</div>
        <button onClick={() => setShowAddEvent(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
          <X size={18} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ ...S.label, marginBottom: 4 }}>Título del Suceso</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={S.input}
            placeholder="Ej: Interceptación de llamada"
          />
        </div>

        <div>
          <div style={{ ...S.label, marginBottom: 4 }}>Fecha</div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={S.input}
          />
        </div>

        <div>
          <div style={{ ...S.label, marginBottom: 4 }}>Descripción</div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={S.textarea}
            placeholder="Detalles del acontecimiento..."
            rows={3}
          />
        </div>

        <div>
          <div style={{ ...S.label, marginBottom: 6 }}>Personas Involucradas</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 150, overflow: 'auto' }}>
            {nodes.map(node => (
              <div
                key={node.id}
                onClick={() => togglePerson(node.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: selectedPersons.includes(node.id) ? '#f59e0b20' : '#0b1020',
                  border: selectedPersons.includes(node.id) ? '1px solid #f59e0b40' : '1px solid #1e2d4a'
                }}
              >
                <div style={{ 
                  width: 16, height: 16, borderRadius: 4, 
                  background: selectedPersons.includes(node.id) ? '#f59e0b' : '#1a2a45',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' 
                }}>
                  {selectedPersons.includes(node.id) && <CheckCircle size={10} color="#000" />}
                </div>
                <div style={{ flex: 1, fontSize: 11, color: '#e2e8f0' }}>{node.name}</div>
                <div style={{ ...S.badge(ROLE_COLORS[node.role]), fontSize: 8 }}>{node.role}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={() => setShowAddEvent(false)} style={{ ...S.btn('ghost'), flex: 1, justifyContent: 'center' }}>
          Cancelar
        </button>
        <button onClick={handleAdd} style={{ ...S.btn(), flex: 1, justifyContent: 'center' }}>
          <Plus size={14} /> Agregar
        </button>
      </div>
    </div>
  );
}

function NetworkMap({ persons: externalPersons, setPersons, incidents: externalIncidents, theme: externalTheme, setTheme: externalSetTheme, savedMaps = [], setSavedMaps, aiResolved, watchlist = [] }) {
  const [internalTheme, setInternalTheme] = useState('dark');
  const theme = externalTheme || internalTheme;
  const setTheme = externalSetTheme || setInternalTheme;
  const [viewMode, setViewMode] = useState('jerárquico');
  const [nodes, setNodes] = useState(SAMPLE_NODES);
  const [connections, setConnections] = useState(SAMPLE_CONNECTIONS);
  const [selectedNode, setSelectedNode] = useState(null);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [events, setEvents] = useState([]);
  const [connectionColor, setConnectionColor] = useState('#22d3ee');
  const [connectionWidth, setConnectionWidth] = useState(2);

  const themeStyles = {
    dark: {
      bg: '#080c18',
      bg2: '#0d1426',
      bg3: '#0f1629',
      border: '#1e2d4a',
      text: '#e2e8f0',
      text2: '#94a3b8',
      text3: '#64748b',
      accent: '#f59e0b',
      card: '#0f1629',
      node: '#0f1629'
    },
    light: {
      bg: '#f8fafc',
      bg2: '#e2e8f0',
      bg3: '#cbd5e1',
      border: '#94a3b8',
      text: '#1e293b',
      text2: '#475569',
      text3: '#64748b',
      accent: '#f59e0b',
      card: '#ffffff',
      node: '#ffffff'
    },
    mixed: {
      bg: '#1a1a2e',
      bg2: '#16213e',
      bg3: '#0f3460',
      border: '#533483',
      text: '#eaeaea',
      text2: '#c4c4c4',
      text3: '#a0a0a0',
      accent: '#e94560',
      card: '#1f1f3d',
      node: '#252545'
    }
  };

  const t = themeStyles[theme];
  const [showAddConnection, setShowAddConnection] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [connectingFrom, setConnectingFrom] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const canvasRef = useRef(null);

  const [newPerson, setNewPerson] = useState({ name: '', role: 'líder', docNumber: '', notes: '', photo: null });
  const [newConnection, setNewConnection] = useState({ from: '', to: '', label: '', style: 'solid', color: '#22d3ee' });
  const [analyzing, setAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);

  useEffect(() => {
    if (externalPersons && externalPersons.length > 0) {
      setNodes(externalPersons);
      
      // Try to generate connections from shared incidents
      if (externalIncidents && externalIncidents.length > 0) {
        const newConnections = [];
        const addedConnections = new Set();
        
        externalIncidents.forEach((incident) => {
          if (incident.persons && incident.persons.length > 1) {
            for (let i = 0; i < incident.persons.length; i++) {
              for (let j = i + 1; j < incident.persons.length; j++) {
                const p1 = incident.persons[i];
                const p2 = incident.persons[j];
                const p1Id = p1.id || p1._pid;
                const p2Id = p2.id || p2._pid;
                const key = [p1Id, p2Id].sort().join('-');
                if (!addedConnections.has(key)) {
                  addedConnections.add(key);
                  newConnections.push({
                    from: p1Id,
                    to: p2Id,
                    label: 'Comparten incidente'
                  });
                }
              }
            }
          }
        });
        
        if (newConnections.length > 0) {
          setConnections(newConnections);
        } else {
          setConnections(SAMPLE_CONNECTIONS);
        }
      } else {
        setConnections(SAMPLE_CONNECTIONS);
      }
    } else {
      // Use sample data
      setNodes(SAMPLE_NODES);
      setConnections(SAMPLE_CONNECTIONS);
    }
  }, [externalPersons, externalIncidents]);

  // Save to parent when nodes change
  useEffect(() => {
    if (setPersons && nodes.length > 0 && nodes !== SAMPLE_NODES) {
      setPersons(nodes);
    }
  }, [nodes, setPersons]);

  // Análisis IA del mapa de personas usando Ollama local
  const handleAnalyze = async () => {
    if (!nodes || nodes.length === 0) return;
    setAnalyzing(true);
    setAiAnalysis(null);
    
    try {
      // Preparar datos del mapa
      const nodesData = nodes.map(n => `- ${n.name} (${n.role}): ${n.notes || 'Sin notas'}`).join('\n');
      const connectionsData = connections.map(c => {
        const fromNode = nodes.find(n => n.id === c.from);
        const toNode = nodes.find(n => n.id === c.to);
        return `- ${fromNode?.name || c.from} → ${toNode?.name || c.to}: ${c.label}`;
      }).join('\n');
      
      const prompt = `Eres un analista de inteligencia. Analiza el siguiente mapa de relaciones de personas e identifica:
1. Patrones y conexiones ocultas
2. Personas clave (más conexiones)
3. Posibles relaciones no detectadas
4. Recomendaciones de investigación

MAPA DE PERSONAS:
${nodesData}

CONEXIONES:
${connectionsData}

Responde en español con un análisis detallado en máximo 300 palabras.`;

      // Usa el proveedor de IA configurado en Ajustes (Anthropic / OpenAI / Gemini / OpenRouter / compatible / Ollama)
      if (!window.electronAPI || !window.electronAPI.aiRequest) {
        throw new Error('IA no disponible en este entorno');
      }
      if (!aiResolved || (aiResolved.provider !== 'ollama' && !aiResolved.apiKey)) {
        throw new Error('Configura un proveedor de IA y su clave en Configuración → IA / API');
      }
      const result = await window.electronAPI.aiRequest({
        config: aiResolved,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        max_tokens: 800,
      });
      if (!result.ok) {
        throw new Error((result.data && result.data.error && result.data.error.message) || ('Error ' + result.status));
      }
      const text = ((result.data.content && result.data.content.find(c => c.type === 'text')) || result.data.content?.[0] || {}).text || '';
      setAiAnalysis(text || 'Análisis completado');
    } catch (err) {
      setAiAnalysis('Error: ' + err.message);
    }
    setAnalyzing(false);
  };

  // Remove the problematic sync back to parent - we'll handle saves manually

  const getNodePosition = useCallback((node, index, total) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 100, y: 100 };
    
    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 600;
    const centerX = width / 2;
    const centerY = height / 2;

    switch (viewMode) {
      case 'jerárquico':
        const levels = {};
        nodes.forEach((n, i) => {
          const level = n.role === 'líder' || n.role === 'núcleo' ? 0 :
                       n.role === 'corrupción' || n.role === 'dinero' ? 1 :
                       n.role === 'droga' ? 2 : 3;
          if (!levels[level]) levels[level] = [];
          levels[level].push(i);
        });
        let levelCount = 0;
        let currentLevel = 0;
        for (let l = 0; l <= 3; l++) {
          if (levels[l] && levels[l].includes(index)) {
            currentLevel = l;
            break;
          }
        }
        const levelNodes = levels[currentLevel] || [];
        const levelIndex = levelNodes.indexOf(index);
        const y = 80 + currentLevel * 140;
        const x = centerX + (levelIndex - (levelNodes.length - 1) / 2) * 180;
        return { x, y };
      
      case 'radial':
        const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
        const radius = Math.min(width, height) * 0.3;
        return {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius
        };
      
      case 'fuerza':
        const spread = 200;
        return {
          x: centerX + Math.cos(index * 0.8) * spread * (1 + index * 0.1),
          y: centerY + Math.sin(index * 0.8) * spread * (1 + index * 0.1)
        };
      
      case 'lista':
        const cols = 3;
        const col = index % cols;
        const row = Math.floor(index / cols);
        return {
          x: 50 + col * 250,
          y: 50 + row * 180
        };
      
      default:
        return { x: 100 + index * 150, y: 100 };
    }
  }, [viewMode, nodes, canvasRef]);

  const [nodePositions, setNodePositions] = useState({});

  const handleNodeMouseDown = (e, nodeId) => {
    e.stopPropagation();
    setDraggingNode(nodeId);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleNodeMouseMove = (e) => {
    if (draggingNode) {
      const dx = (e.clientX - dragStart.x) / zoom;
      const dy = (e.clientY - dragStart.y) / zoom;
      setNodePositions(prev => ({
        ...prev,
        [draggingNode]: {
          x: (prev[draggingNode]?.x || 0) + dx,
          y: (prev[draggingNode]?.y || 0) + dy
        }
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleNodeMouseUp = () => {
    setDraggingNode(null);
  };

  const [draggingNode, setDraggingNode] = useState(null);

  const getFinalPosition = (node, index, total) => {
    const autoPos = getNodePosition(node, index, total);
    if (nodePositions[node.id] !== undefined) {
      return {
        x: autoPos.x + nodePositions[node.id].x,
        y: autoPos.y + nodePositions[node.id].y
      };
    }
    return autoPos;
  };

  // Get position for events (placed in center of involved persons)
  const getEventPosition = (event, index) => {
    if (nodePositions[`event-${event.id}`] !== undefined) {
      return { 
        x: 400 + nodePositions[`event-${event.id}`].x, 
        y: 300 + nodePositions[`event-${event.id}`].y 
      };
    }
    
    if (!event.persons || event.persons.length === 0) {
      return { x: 400 + index * 50, y: 300 };
    }
    
    let sumX = 0, sumY = 0;
    event.persons.forEach(personId => {
      const personIdx = nodes.findIndex(n => n.id === personId);
      if (personIdx >= 0) {
        const pos = getNodePosition(nodes[personIdx], personIdx, nodes.length);
        sumX += pos.x;
        sumY += pos.y;
      }
    });
    
    const count = event.persons.length;
    return { x: sumX / count + 150, y: sumY / count };
  };

  const [draggingEvent, setDraggingEvent] = useState(null);
  const [showLoadMap, setShowLoadMap] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newMapName, setNewMapName] = useState('');
  // savedMaps llega como prop desde App (persistido en el store cifrado).
  // Fallback local por si el componente se usa de forma aislada (web/test).
  const [savedMapsLocal, setSavedMapsLocal] = useState([]);
  const mapsList = setSavedMaps ? savedMaps : savedMapsLocal;
  const updateMaps = setSavedMaps ? setSavedMaps : setSavedMapsLocal;

  const handleSaveMap = () => {
    setNewMapName(`Mapa ${new Date().toLocaleDateString()}`);
    setShowSaveModal(true);
  };

  const handleConfirmSave = () => {
    if (!newMapName.trim()) return;
    
    const mapData = {
      id: Date.now(),
      name: newMapName,
      date: new Date().toISOString(),
      nodes: nodes,
      connections: connections,
      events: events
    };
    
    updateMaps([...mapsList, mapData]);
    setShowSaveModal(false);
    alert('Mapa guardado exitosamente!');
  };

  const handleLoadMap = (map) => {
    if (confirm(`Cargar "${map.name}"? Esto reemplazará el mapa actual.`)) {
      setNodes(map.nodes);
      setConnections(map.connections);
      setEvents(map.events || []);
      setShowLoadMap(false);
    }
  };

  const handleDeleteMap = (mapId) => {
    if (confirm('¿Eliminar este mapa?')) {
      updateMaps(mapsList.filter(m => m.id !== mapId));
    }
  };

  const handleEventMouseDown = (e, eventId) => {
    e.stopPropagation();
    setDraggingEvent(eventId);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleEventMouseMove = (e) => {
    if (draggingEvent) {
      const dx = (e.clientX - dragStart.x) / zoom;
      const dy = (e.clientY - dragStart.y) / zoom;
      setNodePositions(prev => ({
        ...prev,
        [`event-${draggingEvent}`]: {
          x: (prev[`event-${draggingEvent}`]?.x || 0) + dx,
          y: (prev[`event-${draggingEvent}`]?.y || 0) + dy
        }
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleEventMouseUp = () => {
    setDraggingEvent(null);
  };

  const renderEvent = (event, index) => {
    const pos = getEventPosition(event, index);
    
    return (
      <div
        key={`event-${event.id}`}
        style={{
          position: 'absolute',
          left: pos.x * zoom + pan.x,
          top: pos.y * zoom + pan.y,
          transform: 'translate(-50%, -50%)',
          zIndex: 15,
          cursor: draggingEvent === event.id ? 'grabbing' : 'grab'
        }}
        onClick={(e) => { e.stopPropagation(); setSelectedNode(event); }}
        onMouseDown={(e) => handleEventMouseDown(e, event.id)}
        onMouseMove={draggingEvent === event.id ? handleEventMouseMove : undefined}
        onMouseUp={handleEventMouseUp}
        onMouseLeave={handleEventMouseUp}
      >
        <div style={{
          background: '#1e3a5f',
          border: '2px solid #3b82f6',
          borderRadius: 8,
          padding: '8px 12px',
          minWidth: 140,
          textAlign: 'center',
          boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
        }}>
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>{event.date}</div>
          <div style={{ fontWeight: 600, fontSize: 11, color: '#60a5fa', marginBottom: 4 }}>{event.title}</div>
          <div style={{ fontSize: 9, color: '#64748b' }}>{event.persons?.length || 0} involucrad{event.persons?.length === 1 ? 'o' : 'os'}</div>
        </div>
      </div>
    );
  };

  const handleCanvasMouseDown = (e) => {
    if (e.target === canvasRef.current) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleCanvasMouseMove = (e) => {
    if (isDragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(false);
  };

  const handleNodeClick = (node) => {
    setSelectedNode(node);
    setSidebarOpen(true);
  };

  const handleNodeRightClick = (e, node) => {
    e.preventDefault();
    setConnectingFrom(node);
    setShowAddConnection(true);
  };

  const handleAddPerson = () => {
    if (!newPerson.name.trim()) return;
    // Búsqueda inteligente: casos asociados desde informes + vigilancia
    const related = findRelatedCases(
      { name: newPerson.name, docNumber: newPerson.docNumber },
      externalIncidents, watchlist
    );
    const autoNote = buildCasesNote(related);
    const notes = [newPerson.notes && newPerson.notes.trim(), autoNote].filter(Boolean).join("\n\n");
    const person = {
      ...newPerson,
      notes,
      id: Date.now()
    };
    setNodes([...nodes, person]);
    setNewPerson({ name: '', role: 'líder', docNumber: '', notes: '', photo: null });
    setShowAddPerson(false);
  };

  const handleAddConnection = () => {
    if (!newConnection.from || !newConnection.to) return;
    const conn = {
      from: parseInt(newConnection.from),
      to: parseInt(newConnection.to),
      label: newConnection.label,
      style: newConnection.style || 'solid',
      color: newConnection.color || connectionColor
    };
    setConnections([...connections, conn]);
    setNewConnection({ from: '', to: '', label: '', style: 'solid', color: '#22d3ee' });
    setConnectingFrom(null);
    setShowAddConnection(false);
  };

  const handleDeleteNode = (id) => {
    setNodes(nodes.filter(n => n.id !== id));
    setConnections(connections.filter(c => c.from !== id && c.to !== id));
    setSelectedNode(null);
    setSidebarOpen(false);
  };

  const handleExportPDF = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const canvasEl = await html2canvas(canvas, {
        backgroundColor: '#080c18',
        scale: 2,
        useCORS: true,
        logging: false
      });

      const imgData = canvasEl.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: canvasEl.width > canvasEl.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [canvasEl.width, canvasEl.height]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, canvasEl.width, canvasEl.height);
      pdf.save(`network-map-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
      const svgContent = generateSVG();
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `network-map-${new Date().toISOString().slice(0, 10)}.svg`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const generateSVG = () => {
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" style="background:#080c18">`;
    
    connections.forEach(conn => {
      const fromNode = nodes.find(n => n.id === conn.from);
      const toNode = nodes.find(n => n.id === conn.to);
      if (!fromNode || !toNode) return;
      
      const fromPos = getNodePosition(fromNode, nodes.indexOf(fromNode), nodes.length);
      const toPos = getNodePosition(toNode, nodes.indexOf(toNode), nodes.length);
      
      svg += `<line x1="${fromPos.x}" y1="${fromPos.y}" x2="${toPos.x}" y2="${toPos.y}" stroke="#475569" stroke-width="2" marker-end="url(#arrow)"/>`;
      svg += `<text x="${(fromPos.x + toPos.x) / 2}" y="${(fromPos.y + toPos.y) / 2 - 5}" fill="#94a3b8" font-size="10" text-anchor="middle">${conn.label}</text>`;
    });

    svg += `<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#475569"/></marker></defs>`;

    nodes.forEach((node, idx) => {
      const pos = getNodePosition(node, idx, nodes.length);
      const color = ROLE_COLORS[node.role] || '#64748b';
      
      svg += `<rect x="${pos.x - 60}" y="${pos.y - 30}" width="120" height="60" fill="#0f1629" stroke="${color}" stroke-width="2" rx="4"/>`;
      svg += `<text x="${pos.x}" y="${pos.y - 8}" fill="#f1f5f9" font-size="12" font-weight="bold" text-anchor="middle">${node.name}</text>`;
      svg += `<text x="${pos.x}" y="${pos.y + 10}" fill="${color}" font-size="9" text-anchor="middle">${ROLE_LABELS[node.role] || node.role}</text>`;
    });

    svg += `</svg>`;
    return svg;
  };

  const getConnectedIncidents = (nodeId) => {
    return connections.filter(c => c.from === nodeId || c.to === nodeId).length;
  };

  const getRelatedPersons = (nodeId) => {
    const relatedIds = connections
      .filter(c => c.from === nodeId || c.to === nodeId)
      .map(c => c.from === nodeId ? c.to : c.from);
    return nodes.filter(n => relatedIds.includes(n.id));
  };

  const renderNode = (node, index) => {
    const pos = getFinalPosition(node, index, nodes.length);
    const color = ROLE_COLORS[node.role] || '#64748b';
    
    return (
      <div
        key={node.id}
        style={{
          position: 'absolute',
          left: pos.x * zoom + pan.x,
          top: pos.y * zoom + pan.y,
          transform: 'translate(-50%, -50%)',
          cursor: draggingNode === node.id ? 'grabbing' : 'grab',
          zIndex: 10
        }}
        onClick={(e) => { e.stopPropagation(); handleNodeClick(node); }}
        onContextMenu={(e) => { e.preventDefault(); handleNodeRightClick(e, node); }}
        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
        onMouseMove={handleNodeMouseMove}
        onMouseUp={handleNodeMouseUp}
        onMouseLeave={handleNodeMouseUp}
      >
        <div style={{
          background: '#0f1629',
          border: `2px solid ${color}`,
          borderRadius: 4,
          padding: '8px 12px',
          minWidth: 120,
          textAlign: 'center',
          boxShadow: selectedNode?.id === node.id ? `0 0 20px ${color}40` : 'none',
          transition: 'all 0.2s'
        }}>
          {node.photo ? (
            <img src={node.photo} alt="" style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover', marginBottom: 4 }} />
          ) : (
            <div style={{ width: 40, height: 40, borderRadius: 4, background: '#1a2a45', margin: '0 auto 4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <User size={18} color="#475569" />
            </div>
          )}
          <div style={{ fontWeight: 600, fontSize: 12, color: '#f1f5f9', marginBottom: 2 }}>{node.name}</div>
          <div style={{ ...S.badge(color), fontSize: 9, padding: '1px 6px' }}>{ROLE_LABELS[node.role] || node.role}</div>
          {node.docNumber && <div style={{ fontSize: 9, color: '#64748b', marginTop: 2, fontFamily: "'JetBrains Mono',monospace" }}>{node.docNumber}</div>}
        </div>
      </div>
    );
  };

  const renderConnection = (conn, index) => {
    const fromNode = nodes.find(n => n.id === conn.from || n._pid === conn.from);
    const toNode = nodes.find(n => n.id === conn.to || n._pid === conn.to);
    if (!fromNode || !toNode) return null;

    const fromIdx = nodes.indexOf(fromNode);
    const toIdx = nodes.indexOf(toNode);
    const fromPos = getFinalPosition(fromNode, fromIdx, nodes.length);
    const toPos = getFinalPosition(toNode, toIdx, nodes.length);

    const x1 = fromPos.x * zoom + pan.x;
    const y1 = fromPos.y * zoom + pan.y;
    const x2 = toPos.x * zoom + pan.x;
    const y2 = toPos.y * zoom + pan.y;

    const angle = Math.atan2(y2 - y1, x2 - x1);
    const nodeRadius = 35;
    const endX = x2 - nodeRadius * Math.cos(angle);
    const endY = y2 - nodeRadius * Math.sin(angle);

    const midX = (x1 + endX) / 2;
    const midY = (y1 + endY) / 2;

    const connColor = conn.color || connectionColor;
    const connWidth = conn.style === 'thick' ? 5 : conn.style === 'thin' ? 1 : 3;

    return (
      <div key={index} style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', zIndex: 5 }}>
        <svg width="100%" height="100%" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
          <defs>
            <marker id={`arrow-${index}`} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill={connColor} />
            </marker>
          </defs>
          <line 
            x1={x1} y1={y1} x2={endX} y2={endY} 
            stroke={connColor} 
            strokeWidth={connWidth} 
            strokeLinecap="round"
            markerEnd={`url(#arrow-${index})`} 
          />
        </svg>
        {conn.label && (
          <div style={{
            position: 'absolute',
            left: midX,
            top: midY,
            transform: 'translate(-50%, -50%)',
            background: '#fff',
            padding: '2px 6px',
            borderRadius: 3,
            fontSize: 9,
            color: connColor,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
          }}>
            {conn.label}
          </div>
        )}
      </div>
    );
  };

  const renderListView = () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, padding: 20 }}>
      {nodes.map((node, idx) => {
        const color = ROLE_COLORS[node.role] || '#64748b';
        const relatedCount = getConnectedIncidents(node.id);
        
        return (
          <div
            key={node.id}
            style={{
              ...S.card,
              cursor: 'pointer',
              transition: 'all 0.2s',
              borderLeft: `3px solid ${color}`
            }}
            onClick={() => handleNodeClick(node)}
          >
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {node.photo ? (
                <img src={node.photo} alt="" style={{ width: 48, height: 56, borderRadius: 4, objectFit: 'cover' }} />
              ) : (
                <div style={{ width: 48, height: 56, borderRadius: 4, background: '#1a2a45', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <User size={20} color="#475569" />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#f1f5f9', marginBottom: 2 }}>{node.name}</div>
                <div style={{ ...S.badge(color), fontSize: 9, marginBottom: 4 }}>{ROLE_LABELS[node.role] || node.role}</div>
                {node.docNumber && (
                  <div style={{ fontSize: 10, color: '#64748b', fontFamily: "'JetBrains Mono',monospace" }}>
                    <FileText size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                    {node.docNumber}
                  </div>
                )}
                <div style={{ fontSize: 10, color: '#475569', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Link2 size={10} /> {relatedCount} conexión{relatedCount !== 1 ? 'es' : ''}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

return (
    <div style={{ ...S.app, background: t.bg }}>
      <style>{`
        ::-webkit-scrollbar-track { background: ${t.bg3}; }
        ::-webkit-scrollbar-thumb { background: ${t.border}; border-radius: 2px; }
      `}</style>
      
      <div style={{ ...S.sidebar, background: t.bg2, borderColor: t.border }}>
        <div style={S.sideHeader}>
          <div style={S.logo}>AERO<span style={{ color: '#f59e0b' }}>REPORT</span></div>
          <div style={S.logoSub}>Network Map</div>
        </div>
        
        <div style={{ padding: 12, flex: 1 }}>
          <button
            onClick={() => setShowAddPerson(true)}
            style={{ ...S.btn(), width: '100%', justifyContent: 'center', marginBottom: 8 }}
          >
            <Plus size={14} /> Agregar Persona
          </button>
          
          <button
            onClick={() => setShowAddEvent(true)}
            style={{ ...S.btn('ghost'), width: '100%', justifyContent: 'center', marginBottom: 12 }}
          >
            <Plus size={14} /> Agregar Suceso
          </button>
          
          {events.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ ...S.label, marginBottom: 6 }}>Sucesos ({events.length})</div>
              {events.map((evt, idx) => (
                <div key={idx} style={{ 
                  background: '#0b1020', border: '1px solid #1e2d4a', borderRadius: 6, 
                  padding: 8, marginBottom: 6, cursor: 'pointer' 
                }}>
                  <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 500 }}>{evt.title}</div>
                  <div style={{ fontSize: 9, color: '#64748b' }}>{evt.date} · {evt.persons?.length || 0} involucrad{evt.persons?.length === 1 ? 'o' : 'os'}</div>
                </div>
              ))}
            </div>
          )}
          
          <div style={{ ...S.label, marginBottom: 8 }}>Vista del Mapa</div>
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value)}
            style={{ ...S.select, marginBottom: 12 }}
          >
            <option value="jerárquico">Jerárquico</option>
            <option value="radial">Radial</option>
            <option value="fuerza">Fuerza</option>
            <option value="lista">Lista</option>
          </select>

          <div style={{ ...S.sep }} />

          <div style={{ ...S.label, marginBottom: 8 }}>Clasificación de Personas</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: '#f59e0b' }} />
              <span style={{ color: '#94a3b8' }}>1 Vinculantes</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: '#3b82f6' }} />
              <span style={{ color: '#94a3b8' }}>2 Miembros</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: '#ef4444' }} />
              <span style={{ color: '#94a3b8' }}>3 Sospechosos</span>
            </div>
          </div>

          <div style={{ ...S.label, marginBottom: 8 }}>Tipos de Conexión</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {[
              { label: 'Principal', color: '#f59e0b', width: 3 },
              { label: 'Secundaria', color: '#22d3ee', width: 2 },
              { label: 'Débil', color: '#64748b', width: 1 }
            ].map((conn, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 30, height: conn.width, background: conn.color, borderRadius: 2 }} />
                <span style={{ color: '#94a3b8', fontSize: 10 }}>{conn.label}</span>
              </div>
            ))}
          </div>

          <div style={{ ...S.label, marginBottom: 8 }}>Personalizar Flechas</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>Color de conexión</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {['#f59e0b', '#22d3ee', '#ef4444', '#10b981', '#8b5cf6', '#64748b'].map(color => (
                  <button
                    key={color}
                    onClick={() => setConnectionColor(color)}
                    style={{
                      width: 24, height: 24, borderRadius: 4, background: color,
                      border: connectionColor === color ? '2px solid #fff' : '2px solid transparent',
                      cursor: 'pointer'
                    }}
                  />
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>Grosor: {connectionWidth}px</div>
              <input
                type="range"
                min="1"
                max="5"
                value={connectionWidth}
                onChange={(e) => setConnectionWidth(parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>

        <div style={{ padding: 12, borderTop: '1px solid #1e2d4a' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
            {nodes.length} personas · {connections.length} conexiones
          </div>
        </div>
      </div>

      <div style={S.main}>
        <div style={S.topbar}>
          <div style={{ flex: 1 }}>
            <div style={S.h1}>Mapa de Red</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[
                { key: 'dark', label: 'Oscuro', color: '#1e293b' },
                { key: 'light', label: 'Claro', color: '#e2e8f0' },
                { key: 'mixed', label: 'Mixto', color: '#533483' }
              ].map(mode => (
                <button
                  key={mode.key}
                  onClick={() => setTheme(mode.key)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 6,
                    border: 'none',
                    background: theme === mode.key ? t.accent : t.bg3,
                    color: theme === mode.key ? '#000' : t.text2,
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 500
                  }}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <div style={{ width: 1, height: 24, background: t.border, margin: '0 8px' }} />
            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} style={{ ...S.btn('ghost'), padding: '6px 10px' }}>
              <ZoomOut size={14} />
            </button>
            <span style={{ fontSize: 12, color: '#64748b', minWidth: 45, textAlign: 'center' }}>
              {Math.round(zoom * 100)}%
            </span>
            <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} style={{ ...S.btn('ghost'), padding: '6px 10px' }}>
              <ZoomIn size={14} />
            </button>
            <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} style={{ ...S.btn('ghost'), padding: '6px 10px' }}>
              <RotateCcw size={14} />
            </button>
          </div>

<button onClick={handleExportPDF} style={{ ...S.btn(), padding: '8px 14px' }}>
              <Download size={14} /> Exportar PDF
            </button>
            <button onClick={handleSaveMap} style={{ ...S.btn(), padding: '8px 14px' }}>
              <Plus size={14} /> Guardar
            </button>
            <button onClick={() => setShowLoadMap(true)} style={{ ...S.btn('ghost'), padding: '8px 14px' }}>
              <GitBranch size={14} /> Cargar
            </button>
        </div>

        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {viewMode === 'lista' ? (
            renderListView()
          ) : (
            <div
              ref={canvasRef}
              style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                cursor: isDragging ? 'grabbing' : 'grab',
                background: `
                  radial-gradient(circle at 50% 50%, ${t.border}33 1px, transparent 1px)
                `,
                backgroundSize: '20px 20px',
                backgroundColor: t.bg
              }}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
            >
              {connections.map(renderConnection)}
              {events.map(renderEvent)}
              {nodes.map(renderNode)}

              {connectingFrom && (
                <div style={{
                  position: 'absolute',
                  bottom: 20,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: '#0f1629',
                  border: '1px solid #f59e0b',
                  borderRadius: 8,
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  zIndex: 100
                }}>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>
                    Conectar <strong style={{ color: '#f59e0b' }}>{connectingFrom.name}</strong> con:
                  </span>
                  <select
                    value={newConnection.to}
                    onChange={(e) => setNewConnection({ ...newConnection, to: e.target.value, from: connectingFrom.id.toString() })}
                    style={{ ...S.select, width: 150 }}
                  >
                    <option value="">Seleccionar...</option>
                    {nodes.filter(n => n.id !== connectingFrom.id).map(n => (
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Etiqueta"
                    value={newConnection.label}
                    onChange={(e) => setNewConnection({ ...newConnection, label: e.target.value })}
                    style={{ ...S.input, width: 100 }}
                  />
                  <button onClick={handleAddConnection} style={{ ...S.btn(), padding: '6px 12px' }}>
                    <Plus size={12} /> Agregar
                  </button>
                  <button onClick={() => { setConnectingFrom(null); setNewConnection({ from: '', to: '', label: '' }); }} style={{ ...S.btn('ghost'), padding: '6px 10px' }}>
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {sidebarOpen && selectedNode && (
        <div style={{
          width: 320,
          background: '#0d1426',
          borderLeft: '1px solid #1e2d4a',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          overflow: 'auto'
        }}>
          <div style={{ padding: 16, borderBottom: '1px solid #1e2d4a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={S.h2}>Detalles</div>
            <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
              <X size={18} />
            </button>
          </div>

          <div style={{ padding: 16 }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              {selectedNode.photo ? (
                <img src={selectedNode.photo} alt="" style={{ width: 80, height: 100, borderRadius: 8, objectFit: 'cover', border: '2px solid #1e2d4a' }} />
              ) : (
                <div style={{ width: 80, height: 100, borderRadius: 8, background: '#1a2a45', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', border: '2px solid #1e2d4a' }}>
                  <User size={32} color="#475569" />
                </div>
              )}
            </div>

            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#f1f5f9', marginBottom: 4 }}>{selectedNode.name}</div>
              <div style={S.badge(ROLE_COLORS[selectedNode.role] || '#64748b')}>
                {ROLE_LABELS[selectedNode.role] || selectedNode.role}
              </div>
            </div>

            <div style={S.sep} />

            <div style={{ marginBottom: 12 }}>
              <div style={{ ...S.label, marginBottom: 4 }}>Documento</div>
              <div style={{ fontSize: 13, color: '#e2e8f0', fontFamily: "'JetBrains Mono',monospace" }}>
                {selectedNode.docNumber || 'No disponible'}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ ...S.label, marginBottom: 4 }}>Notas</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{selectedNode.notes || 'Sin notas'}</div>
            </div>

            <div style={S.sep} />

            {(() => {
              const rel = findRelatedCases({ name: selectedNode.name, docNumber: selectedNode.docNumber }, externalIncidents, watchlist);
              return (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ ...S.label, marginBottom: 6 }}>Casos asociados (informes / vigilancia)</div>
                  {rel.cases.length === 0 && rel.watch.length === 0 ? (
                    <div style={{ fontSize: 11, color: '#475569' }}>Sin casos asociados</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {rel.cases.map((c, i) => (
                        <div key={c.id} style={{ background: '#0b1020', borderRadius: 6, padding: '6px 8px' }}>
                          <div style={{ fontSize: 11, color: '#e2e8f0' }}>{i + 1}. {c.label}</div>
                          <div style={{ fontSize: 10, color: '#475569', marginTop: 1 }}>
                            {c.date ? c.date + ' · ' : ''}{c.area}{c.status ? ' · ' + c.status : ''} · {c.matchType === 'exact' ? 'doc exacto' : 'nombre'}
                          </div>
                        </div>
                      ))}
                      {rel.watch.map((w) => (
                        <div key={'w' + w.id} style={{ background: '#ef444412', border: '1px solid #ef444430', borderRadius: 6, padding: '6px 8px' }}>
                          <div style={{ fontSize: 11, color: '#fca5a5', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <AlertTriangle size={11} /> Vigilancia: {w.reason || w.severity}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            <div style={{ marginBottom: 12 }}>
              <div style={{ ...S.label, marginBottom: 4 }}>Conexiones en el mapa</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b', fontFamily: "'Barlow Condensed',sans-serif" }}>
                {getConnectedIncidents(selectedNode.id)}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ ...S.label, marginBottom: 8 }}>Personas Relacionadas</div>
              {getRelatedPersons(selectedNode.id).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {getRelatedPersons(selectedNode.id).map(person => (
                    <div
                      key={person.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 8px',
                        background: '#0b1020',
                        borderRadius: 6,
                        cursor: 'pointer'
                      }}
                      onClick={() => handleNodeClick(person)}
                    >
                      <div style={{ width: 24, height: 24, borderRadius: 4, background: '#1a2a45', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <User size={12} color="#475569" />
                      </div>
                      <div style={{ flex: 1, fontSize: 11, color: '#e2e8f0' }}>{person.name}</div>
                      <ChevronRight size={12} color="#475569" />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#475569' }}>Sin conexiones</div>
              )}
            </div>

            <div style={S.sep} />

            <button 
              onClick={handleAnalyze} 
              disabled={analyzing || nodes.length === 0}
              style={{ ...S.btn(analyzing ? 'ghost' : undefined), width: '100%', justifyContent: 'center', marginBottom: 8, opacity: analyzing ? 0.6 : 1 }}
            >
              <Brain size={14} /> {analyzing ? 'Analizando...' : 'Análisis IA'}
            </button>

            {aiAnalysis && (
              <div style={{ background: '#0b1020', border: '1px solid #1e2d4a', borderRadius: 8, padding: 10, marginBottom: 8, maxHeight: 150, overflow: 'auto' }}>
                <div style={{ ...S.label, marginBottom: 6 }}>Resultado del Análisis</div>
                <div style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{aiAnalysis}</div>
              </div>
            )}

            <button
              onClick={() => handleDeleteNode(selectedNode.id)}
              style={{ ...S.btn('danger'), width: '100%', justifyContent: 'center' }}
            >
              <Trash2 size={14} /> Eliminar
            </button>
          </div>
        </div>
      )}

      {showAddPerson && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{ background: '#0f1629', border: '1px solid #1e2d4a', borderRadius: 12, padding: 24, width: 400 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={S.h2}>Agregar Persona</div>
              <button onClick={() => setShowAddPerson(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ ...S.label, marginBottom: 4 }}>Foto</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {newPerson.photo ? (
                    <img src={newPerson.photo} alt="" style={{ width: 50, height: 50, borderRadius: 6, objectFit: 'cover', border: '1px solid #1e2d4a' }} />
                  ) : (
                    <div style={{ width: 50, height: 50, borderRadius: 6, background: '#1a2a45', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #1e2d4a' }}>
                      <User size={20} color="#475569" />
                    </div>
                  )}
                  <label style={{ ...S.btn('ghost'), padding: '6px 12px', cursor: 'pointer' }}>
                    <Image size={14} /> Subir
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => setNewPerson({ ...newPerson, photo: ev.target.result });
                        reader.readAsDataURL(file);
                      }
                    }} />
                  </label>
                </div>
              </div>

              <div>
                <div style={{ ...S.label, marginBottom: 4 }}>Nombre</div>
                <input
                  value={newPerson.name}
                  onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value })}
                  style={S.input}
                  placeholder="Nombre completo"
                />
              </div>

              <div>
                <div style={{ ...S.label, marginBottom: 4 }}>Rol</div>
                <select
                  value={newPerson.role}
                  onChange={(e) => setNewPerson({ ...newPerson, role: e.target.value })}
                  style={S.select}
                >
                  <option value="líder">1 Vinculante</option>
                  <option value="miembro">2 Miembro</option>
                  <option value="sospechoso">3 Sospechoso</option>
                  <option value="corrupción">4 Corrupción</option>
                  <option value="droga">5 Droga</option>
                  <option value="tecnología">6 Tecnología</option>
                  <option value="investigación">7 Investigación</option>
                  <option value="testigo">Testigo</option>
                  <option value="victima">Víctima</option>
                </select>
              </div>

              <div>
                <div style={{ ...S.label, marginBottom: 4 }}>Número de Documento</div>
                <input
                  value={newPerson.docNumber}
                  onChange={(e) => setNewPerson({ ...newPerson, docNumber: e.target.value })}
                  style={S.input}
                  placeholder="001-1234567-8"
                />
              </div>

              <div>
                <div style={{ ...S.label, marginBottom: 4 }}>Notas</div>
                <textarea
                  value={newPerson.notes}
                  onChange={(e) => setNewPerson({ ...newPerson, notes: e.target.value })}
                  style={S.textarea}
                  placeholder="Notas adicionales..."
                  rows={3}
                />
              </div>
            </div>

            {(() => {
              const rel = findRelatedCases({ name: newPerson.name, docNumber: newPerson.docNumber }, externalIncidents, watchlist);
              const total = rel.cases.length + rel.watch.length;
              if (!total) return null;
              return (
                <div style={{ marginTop: 12, background: '#0b1020', border: '1px solid #f59e0b40', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b', marginBottom: 6 }}>
                    🔎 {total} caso(s) asociado(s) — se añadirán a la descripción
                  </div>
                  {rel.cases.map((c, i) => (
                    <div key={c.id} style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>
                      {i + 1}. {c.label}{c.date ? ` (${c.date})` : ''} · {c.area}{c.matchType === 'exact' ? ' · doc exacto' : ' · nombre'}
                    </div>
                  ))}
                  {rel.watch.map((w) => (
                    <div key={'w' + w.id} style={{ fontSize: 11, color: '#fca5a5', marginBottom: 2 }}>
                      ⚠ Vigilancia: {w.reason || w.severity}
                    </div>
                  ))}
                </div>
              );
            })()}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowAddPerson(false)} style={{ ...S.btn('ghost'), flex: 1, justifyContent: 'center' }}>
                Cancelar
              </button>
              <button onClick={handleAddPerson} style={{ ...S.btn(), flex: 1, justifyContent: 'center' }}>
                <Plus size={14} /> Agregar
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddEvent && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <AddEventModal nodes={nodes} setEvents={setEvents} setShowAddEvent={setShowAddEvent} ROLE_COLORS={ROLE_COLORS} />
        </div>
      )}

      {showSaveModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{ background: '#0f1629', border: '1px solid #1e2d4a', borderRadius: 12, padding: 24, width: 350 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={S.h2}>Guardar Mapa</div>
              <button onClick={() => setShowSaveModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>
            <div>
              <div style={{ ...S.label, marginBottom: 4 }}>Nombre del mapa</div>
              <input
                value={newMapName}
                onChange={(e) => setNewMapName(e.target.value)}
                style={S.input}
                placeholder="Nombre del mapa"
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowSaveModal(false)} style={{ ...S.btn('ghost'), flex: 1, justifyContent: 'center' }}>
                Cancelar
              </button>
              <button onClick={handleConfirmSave} style={{ ...S.btn(), flex: 1, justifyContent: 'center' }}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {showLoadMap && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{ background: '#0f1629', border: '1px solid #1e2d4a', borderRadius: 12, padding: 24, width: 400, maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={S.h2}>Mapas Guardados</div>
              <button onClick={() => setShowLoadMap(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>
            
            {mapsList.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#64748b', padding: 20 }}>
                No hay mapas guardados
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {mapsList.map(map => (
                  <div key={map.id} style={{ 
                    background: '#0b1020', border: '1px solid #1e2d4a', borderRadius: 8, padding: 12,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center' 
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, color: '#f1f5f9', fontSize: 13 }}>{map.name}</div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>
                        {new Date(map.date).toLocaleDateString()} · {map.nodes?.length || 0} nodos
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => handleLoadMap(map)} style={{ ...S.btn(), padding: '4px 10px', fontSize: 11 }}>
                        Cargar
                      </button>
                      <button onClick={() => handleDeleteMap(map.id)} style={{ ...S.btn('danger'), padding: '4px 8px' }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showAddConnection && !connectingFrom && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{ background: '#0f1629', border: '1px solid #1e2d4a', borderRadius: 12, padding: 24, width: 400 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={S.h2}>Agregar Conexión</div>
              <button onClick={() => setShowAddConnection(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ ...S.label, marginBottom: 4 }}>Desde</div>
                <select
                  value={newConnection.from}
                  onChange={(e) => setNewConnection({ ...newConnection, from: e.target.value })}
                  style={S.select}
                >
                  <option value="">Seleccionar persona...</option>
                  {nodes.map(n => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ ...S.label, marginBottom: 4 }}>Hacia</div>
                <select
                  value={newConnection.to}
                  onChange={(e) => setNewConnection({ ...newConnection, to: e.target.value })}
                  style={S.select}
                >
                  <option value="">Seleccionar persona...</option>
                  {nodes.filter(n => n.id.toString() !== newConnection.from).map(n => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ ...S.label, marginBottom: 4 }}>Etiqueta</div>
                <input
                  value={newConnection.label}
                  onChange={(e) => setNewConnection({ ...newConnection, label: e.target.value })}
                  style={S.input}
                  placeholder="Ej: Socio, Cliente, Testigo"
                />
              </div>

              <div>
                <div style={{ ...S.label, marginBottom: 4 }}>Estilo de Flecha</div>
                <select
                  value={newConnection.style || 'solid'}
                  onChange={(e) => setNewConnection({ ...newConnection, style: e.target.value })}
                  style={S.select}
                >
                  {ARROW_STYLES.map((s, i) => (
                    <option key={i} value={s.style}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ ...S.label, marginBottom: 4 }}>Color de Flecha</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['#f59e0b', '#22d3ee', '#ef4444', '#10b981', '#8b5cf6', '#64748b'].map(color => (
                    <button
                      key={color}
                      onClick={() => setNewConnection({ ...newConnection, color })}
                      style={{
                        width: 24, height: 24, borderRadius: 4, background: color,
                        border: (newConnection.color || '#22d3ee') === color ? '2px solid #fff' : '2px solid transparent',
                        cursor: 'pointer'
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowAddConnection(false)} style={{ ...S.btn('ghost'), flex: 1, justifyContent: 'center' }}>
                Cancelar
              </button>
              <button onClick={handleAddConnection} style={{ ...S.btn(), flex: 1, justifyContent: 'center' }}>
                <Plus size={14} /> Agregar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default NetworkMap;
