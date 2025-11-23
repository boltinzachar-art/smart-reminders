import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { supabase } from './supabaseClient';
import WebApp from '@twa-dev/sdk';
import { 
  Plus, Search, ExternalLink, RefreshCw, RotateCcw, Trash2, GripVertical, 
  CloudOff, ChevronRight, ChevronLeft, Calendar as CalendarIcon, Clock, MapPin, 
  Flag, CheckCircle2, List as ListIcon, Inbox, CalendarClock, MoreHorizontal, 
  Check, X, Wand2, Loader2, Copy, AlertTriangle, ArrowDown, Sparkles, Settings,
  Zap, MessageCircle, Mail, Phone, Link as LinkIcon, BookmarkPlus
} from 'lucide-react';
import { DndContext, closestCenter, useSensor, useSensors, TouchSensor, PointerSensor } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- 1. LOGIC & HELPERS ---

const calculateNextRun = (current, freq) => {
  if (!current) return null;
  const d = new Date(current);
  if (freq === 'daily') d.setDate(d.getDate() + 1);
  if (freq === 'weekly') d.setDate(d.getDate() + 7);
  if (freq === 'monthly') d.setMonth(d.getMonth() + 1);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const formatTime = (dateStr, isAllDay) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isAllDay) {
      const today = new Date();
      return d.toDateString() === today.toDateString() ? 'Сегодня' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  }
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
};

const performAction = (e, task, showToast) => {
  e.stopPropagation();
  const title = encodeURIComponent(task.title);
  const body = encodeURIComponent(task.description || '');
  
  if (task.type === 'copy') {
      navigator.clipboard.writeText(task.description || task.title);
      if (showToast) showToast("Скопировано");
      return;
  }

  const actions = {
    email: `mailto:?subject=${title}&body=${body}`,
    whatsapp: `https://wa.me/?text=${body}`,
    web_search: `https://www.google.com/search?q=${title}`,
    call: `tel:${task.description || ''}`
  };
  
  if (actions[task.type]) window.open(actions[task.type]);
};

const useDataStore = (userId, isOnline) => {
  const [tasks, setTasks] = useState(() => JSON.parse(localStorage.getItem('tasks') || '[]'));
  const [lists, setLists] = useState([]);
  const [templates, setTemplates] = useState([]);

  useEffect(() => { localStorage.setItem('tasks', JSON.stringify(tasks)); }, [tasks]);

  useEffect(() => {
    if (!userId || !isOnline) return;
    const sync = async () => {
      const [tRes, lRes, tmplRes] = await Promise.all([
        supabase.from('tasks').select('*').eq('telegram_user_id', userId).order('position'),
        supabase.from('lists').select('*').eq('telegram_user_id', userId),
        supabase.from('templates').select('*').eq('telegram_user_id', userId)
      ]);

      if (tRes.data) {
         const local = tasks.filter(x => x.id.toString().startsWith('temp-'));
         const map = new Map(); 
         tRes.data.forEach(x => map.set(x.id, x)); 
         local.forEach(x => map.set(x.id, x));
         setTasks(Array.from(map.values()).sort((a,b) => a.position - b.position));
      }
      if (lRes.data) setLists(lRes.data);
      if (tmplRes.data) setTemplates(tmplRes.data);
    };
    sync(); 
    const i = setInterval(sync, 30000); 
    return () => clearInterval(i);
  }, [userId, isOnline]);

  const modifyTask = async (task, method = 'upsert') => {
      const isTemp = task.id.toString().startsWith('temp-');
      if (method === 'delete') {
          setTasks(p => p.filter(t => t.id !== task.id));
          if (isOnline && !isTemp) await supabase.from('tasks').delete().eq('id', task.id);
      } else {
          setTasks(p => {
              const exists = p.find(t => t.id === task.id);
              return exists ? p.map(t => t.id === task.id ? task : t) : [...p, task];
          });
          if (isOnline) {
              const { id, ...dbData } = task;
              if (isTemp) {
                 const { data } = await supabase.from('tasks').insert([dbData]).select();
                 if (data) setTasks(p => p.map(t => t.id === id ? data[0] : t));
              } else {
                 await supabase.from('tasks').update(dbData).eq('id', id);
              }
          }
      }
  };

  const modifyList = async (list, method = 'upsert') => {
      if (method === 'delete') {
          setLists(p => p.filter(l => l.id !== list.id));
          if (isOnline) await supabase.from('lists').delete().eq('id', list.id);
      } else {
          if (isOnline) {
             const { data } = await supabase.from('lists').insert([list]).select();
             if (data) setLists(p => [...p, data[0]]);
          }
      }
  };

  const modifyTemplate = async (tmpl, method = 'upsert') => {
      if (method === 'delete') {
          setTemplates(p => p.filter(t => t.id !== tmpl.id));
          if (isOnline) await supabase.from('templates').delete().eq('id', tmpl.id);
      } else {
          if (isOnline) {
             const { data } = await supabase.from('templates').insert([tmpl]).select();
             if (data) setTemplates(p => [...p, data[0]]);
          }
      }
  };

  return { tasks, lists, templates, modifyTask, modifyList, modifyTemplate };
};

// --- 2. UI COMPONENTS ---

const ToastContext = createContext();
const ToastProvider = ({ children }) => {
  const [msg, setMsg] = useState(null);
  const show = (text, type = 'success') => { setMsg({ text, type }); setTimeout(() => setMsg(null), 2500); };
  return (
    <ToastContext.Provider value={show}>
      {children}
      {msg && <div className={`fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full shadow-lg z-[100] text-sm font-bold animate-fade-in-ios flex items-center gap-2 ${msg.type === 'error' ? 'bg-red-500 text-white' : 'bg-black/80 text-white backdrop-blur'}`}>{msg.type === 'error' ? <AlertTriangle size={16}/> : <CheckCircle2 size={16}/>} {msg.text}</div>}
    </ToastContext.Provider>
  );
};

// ВОТ ОН! КЛАСС, КОТОРЫЙ БЫЛ ПОТЕРЯН
class ErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError(error) { return { hasError: true }; }
  render() {
    if (this.state.hasError) return <div className="flex flex-col items-center justify-center h-screen text-gray-500"><AlertTriangle size={48} className="mb-4 text-red-500"/><p>Что-то пошло не так.</p><button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg">Перезагрузить</button></div>;
    return this.props.children;
  }
}

const Modal = ({ children, onClose }) => (
  <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
     <div className="bg-[#F2F2F7] w-full sm:max-w-md rounded-t-2xl h-[95vh] flex flex-col shadow-2xl animate-slide-up-ios">
        {children}
     </div>
  </div>
);

const IOSSwitch = ({ checked, onChange }) => (
  <button onClick={() => onChange(!checked)} className={`w-[51px] h-[31px] rounded-full p-0.5 transition-colors duration-300 focus:outline-none ${checked ? 'bg-[#34C759]' : 'bg-[#E9E9EA]'}`}><div className={`w-[27px] h-[27px] bg-white rounded-full shadow-sm transition-transform duration-300 ${checked ? 'translate-x-[20px]' : 'translate-x-0'}`} /></button>
);

const ACTION_ICONS = {
    email: <Mail size={14} />,
    whatsapp: <MessageCircle size={14} />,
    web_search: <Search size={14} />,
    copy: <Copy size={14} />,
    call: <Phone size={14} />
};

const ACTION_NAMES = {
    reminder: 'Нет действия',
    email: 'Email',
    whatsapp: 'WhatsApp',
    web_search: 'Поиск',
    copy: 'Копировать',
    call: 'Позвонить'
};

const TaskItem = ({ task, onAction, viewMode, onSelect, selectionMode, isSelected, onEdit }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const [isCompleting, setIsCompleting] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartX = useRef(0);
  const isSwiping = useRef(false);
  
  const handleMainClick = (e) => {
      if (swipeOffset < 0) { setSwipeOffset(0); return; }
      if (selectionMode) { e.stopPropagation(); onSelect(task.id); }
  };
  
  const handleTouch = {
      start: (e) => { if(!selectionMode && viewMode!=='trash' && !isDragging) { touchStartX.current = e.touches[0].clientX; isSwiping.current = false; }},
      move: (e) => { 
          if(selectionMode || viewMode==='trash' || isDragging) return;
          const diff = e.touches[0].clientX - touchStartX.current;
          if (swipeOffset === 0 && diff < 0) { setSwipeOffset(Math.max(diff, -80)); isSwiping.current = true; } 
          else if (swipeOffset < 0) { setSwipeOffset(Math.min(Math.max(-70 + diff, -80), 0)); isSwiping.current = true; }
      },
      end: () => { if(isSwiping.current) { setSwipeOffset(swipeOffset < -35 ? -70 : 0); isSwiping.current = false; } }
  };

  const style = { transform: CSS.Transform.toString(transform), transition: isDragging ? 'none' : 'transform 0.2s ease', zIndex: isDragging ? 50 : 'auto', opacity: isDragging ? 0.8 : 1, position: 'relative', touchAction: 'pan-y' };
  const contentStyle = { transform: `translateX(${swipeOffset}px)`, transition: isSwiping.current ? 'none' : 'transform 0.2s ease-out' };
  const isOverdue = task.next_run && new Date(task.next_run) < new Date() && !task.completed;
  
  let circleClass = "mt-0.5 shrink-0 w-[24px] h-[24px] rounded-full border-2 flex items-center justify-center transition-all duration-300 ";
  if (selectionMode) circleClass += isSelected ? "bg-blue-500 border-blue-500" : "border-gray-300 bg-transparent";
  else if (isCompleting) circleClass += "animate-blink-3 border-gray-300";
  else if (task.completed) circleClass += "bg-blue-500 border-blue-500";
  else circleClass += "border-gray-300 hover:border-blue-500 bg-transparent";

  return (
    <div ref={setNodeRef} style={style} {...(selectionMode || viewMode === 'trash' ? {} : { ...attributes, ...listeners })}>
      {!isDragging && !selectionMode && viewMode !== 'trash' && (
          <div className="absolute inset-y-0 right-2 flex items-center justify-end z-0"><button className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center text-white shadow-sm active:scale-90 transition-transform" onPointerDown={e=>e.stopPropagation()} onClick={() => onAction('delete', task)}><Trash2 size={18}/></button></div>
      )}
      <div style={contentStyle} onTouchStart={handleTouch.start} onTouchMove={handleTouch.move} onTouchEnd={handleTouch.end} onClick={handleMainClick} className={`relative z-10 group w-full bg-white rounded-xl p-4 shadow-sm flex items-start gap-3 transition-colors ${isCompleting ? 'bg-gray-50' : ''} ${isDragging ? 'shadow-xl ring-2 ring-blue-500/20' : ''}`}>
        <button onPointerDown={e=>e.stopPropagation()} onClick={(e)=>{
            e.stopPropagation();
            if(selectionMode) onSelect(task.id);
            else if(viewMode==='trash') onAction('restore', task);
            else if(viewMode==='completed') onAction('uncomplete', task);
            else { 
                if (isCompleting) { clearTimeout(timerRef.current); setIsCompleting(false); } 
                else { setIsCompleting(true); timerRef.current = setTimeout(() => { onAction('complete', task); setIsCompleting(false); }, 2000); }
            }
        }} className={circleClass}>
          {(selectionMode && isSelected || (!selectionMode && viewMode === 'completed')) && <Check size={14} className="text-white" strokeWidth={3} />}
          {!selectionMode && !viewMode.includes('trash') && task.completed && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
          {viewMode==='trash' && <RotateCcw size={14} className="text-blue-500"/>}
        </button>
        
        <div className="flex-1 min-w-0 pt-0.5 overflow-hidden">
          <div className="flex items-start gap-1 mb-0.5">
             {task.priority > 0 && <span className="text-blue-600 font-bold text-[17px] mr-1 mt-0.5">{'!'.repeat(task.priority)}</span>}
             <div className={`text-[17px] leading-tight break-words line-clamp-2 transition-colors ${task.completed || isCompleting ? 'text-gray-400' : 'text-black'}`}>{task.title}</div>
             {task.is_flagged && <Flag size={14} className="text-orange-500 fill-orange-500 ml-1 mt-1 shrink-0" />}
          </div>
          {task.description && <p className="text-gray-400 font-semibold text-[13px] leading-snug break-words line-clamp-2">{task.description}</p>}
          <div className="flex items-center flex-wrap gap-2 mt-2 h-6 overflow-hidden">
            {task.next_run && <span className={`text-xs font-semibold ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>{formatTime(task.next_run, task.is_all_day)}</span>}
            {task.frequency !== 'once' && <span className="text-gray-400 flex items-center text-xs gap-0.5 font-medium"><RefreshCw size={10} /> {task.frequency}</span>}
            {task.url && <a href={task.url} target="_blank" rel="noreferrer" onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} className="flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 transition"><LinkIcon size={12}/> Ссылка</a>}
            {task.type !== 'reminder' && ACTION_ICONS[task.type] && (
              <button onPointerDown={e=>e.stopPropagation()} onClick={(e) => performAction(e, task)} className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded flex items-center gap-1 hover:bg-gray-200 transition">
                  {ACTION_ICONS[task.type]} {ACTION_NAMES[task.type]}
              </button>
            )}
          </div>
        </div>
        {!selectionMode && !viewMode.includes('trash') && (
            <button className="text-gray-400 p-3 -mr-2 -my-2 hover:bg-gray-100 rounded-full active:text-gray-600 touch-manipulation relative z-20" onPointerDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onEdit(task); }}><MoreHorizontal size={22} /></button>
        )}
      </div>
    </div>
  );
};

// --- 3. MAIN APP ---

const MainApp = () => {
  const toast = useContext(ToastContext);
  const [view, setView] = useState('home');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [userId, setUserId] = useState(null);
  
  // Logic Hook
  const { tasks, lists, templates, modifyTask, modifyList, modifyTemplate } = useDataStore(userId, isOnline);

  // UI States
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [activeModal, setActiveModal] = useState(null); // 'task', 'list', 'templates', 'action', 'listPicker'
  const [editingId, setEditingId] = useState(null);
  
  // Forms
  const [newT, setNewT] = useState({ title: '', description: '', url: '', type: 'reminder', frequency: 'once', priority: 0, is_flagged: false, list_id: null, is_all_day: false });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [aiInstruction, setAiInstruction] = useState('');
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 5 } }));

  // Init
  useEffect(() => {
    const handleStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleStatus); window.addEventListener('offline', handleStatus);
    if (WebApp.initDataUnsafe.user) {
      setUserId(WebApp.initDataUnsafe.user.id);
      WebApp.expand(); 
      try { WebApp.disableVerticalSwipes(); } catch {} 
      WebApp.enableClosingConfirmation();
      WebApp.setHeaderColor('#F2F2F7'); WebApp.setBackgroundColor('#F2F2F7');
    } else { setUserId(777); }
    return () => { window.removeEventListener('online', handleStatus); window.removeEventListener('offline', handleStatus); };
  }, []);

  // Action Handler
  const handleTaskAction = async (action, task) => {
      if (action === 'delete') {
          if (view === 'trash') {
             if(confirm('Удалить навсегда?')) modifyTask(task, 'delete');
          } else {
             modifyTask({ ...task, is_deleted: true });
             toast('В корзине');
          }
      } else if (action === 'restore') {
          modifyTask({ ...task, is_deleted: false });
          toast('Восстановлено');
      } else if (action === 'complete') {
          const isRec = task.frequency !== 'once' && task.next_run;
          const next = isRec ? calculateNextRun(task.next_run, task.frequency) : null;
          modifyTask(isRec ? { ...task, next_run: next } : { ...task, completed: true });
          toast(isRec ? 'Перенесено' : 'Выполнено');
      } else if (action === 'uncomplete') {
          modifyTask({ ...task, completed: false });
      }
  };

  const saveTask = () => {
      if (!newT.title) return toast("Название?", "error");
      // Date Logic
      let finalDate = null;
      if (newT._hasDate) {
          finalDate = newT._dateVal + (newT._hasTime ? 'T' + newT._timeVal : 'T09:00');
      }
      const taskToSave = { 
          ...newT, 
          next_run: finalDate, 
          telegram_user_id: userId,
          status: 'active',
          completed: false,
          is_deleted: false,
          position: tasks.length,
          id: editingId || ('temp-' + Date.now())
      };
      delete taskToSave._hasDate; delete taskToSave._hasTime; delete taskToSave._dateVal; delete taskToSave._timeVal;

      modifyTask(taskToSave);
      setActiveModal(null);
      toast(editingId ? "Сохранено" : "Создано");
  };

  // Derived State
  const filteredTasks = useMemo(() => {
    let res = tasks;
    if (search) {
        const l = search.toLowerCase();
        return tasks.filter(t => !t.is_deleted && (t.title.toLowerCase().includes(l) || (t.next_run && formatTime(t.next_run).includes(l))));
    }
    if (view === 'trash') return res.filter(t => t.is_deleted);
    res = res.filter(t => !t.is_deleted);
    if (view === 'completed') return res.filter(t => t.completed);
    res = res.filter(t => !t.completed);
    
    const today = new Date().setHours(0,0,0,0);
    const tomorrow = today + 86400000;
    if (view === 'today') return res.filter(t => t.next_run && new Date(t.next_run) >= today && new Date(t.next_run) < tomorrow);
    if (view === 'upcoming') return res.filter(t => t.next_run && new Date(t.next_run) >= tomorrow);
    if (view === 'flagged') return res.filter(t => t.is_flagged);
    if (view === 'all') return res;
    return res.filter(t => t.list_id === view);
  }, [tasks, view, search]);

  const openCreator = () => {
      setEditingId(null);
      const now = new Date();
      const tmr = new Date(now); tmr.setDate(tmr.getDate() + 1);
      let dVal = now.toISOString().slice(0, 10);
      let tVal = "09:00";
      let hasD = false;
      let listId = ['home','all','today','upcoming','flagged','trash','completed'].includes(view) ? null : view;
      
      if (view === 'today') hasD = true;
      if (view === 'upcoming') { hasD = true; dVal = tmr.toISOString().slice(0, 10); }

      setNewT({ 
          title: '', description: '', url: '', type: 'reminder', frequency: 'once', 
          priority: 0, is_flagged: view === 'flagged', list_id: listId, is_all_day: false,
          _hasDate: hasD, _hasTime: false, _dateVal: dVal, _timeVal: tVal
      });
      setAiResult(''); setAiInstruction('');
      setActiveModal('task');
  };

  const openEditor = (task) => {
      setEditingId(task.id);
      const d = task.next_run ? new Date(task.next_run) : new Date();
      setNewT({
          ...task,
          _hasDate: !!task.next_run,
          _hasTime: task.next_run && !task.is_all_day,
          _dateVal: d.toISOString().slice(0, 10),
          _timeVal: d.toTimeString().slice(0, 5)
      });
      setAiResult('');
      setActiveModal('task');
  };

  const generateAi = async () => {
      if (!newT.title) return toast("Введите название", "error");
      setAiLoading(true); setAiResult('');
      try {
          const { data, error } = await supabase.functions.invoke('ai-assistant', {
              body: { taskTitle: newT.title, taskDescription: newT.description, type: newT.type, customInstruction: aiInstruction }
          });
          if (error) throw error;
          setAiResult(data.result);
      } catch { toast("Ошибка AI", "error"); } finally { setAiLoading(false); }
  };

  const saveTemplate = () => {
      if (!newT.title) return toast("Название?", "error");
      modifyTemplate({ title: newT.title, description: newT.description, type: newT.type, telegram_user_id: userId });
      toast("Шаблон сохранен");
  };

  // --- RENDER ---
  return (
    <div className="min-h-[100dvh] w-full bg-[#F2F2F7] text-black font-sans flex flex-col overflow-hidden">
      {/* HEADER */}
      <div className="px-4 pt-2 pb-2 bg-[#F2F2F7] sticky top-0 z-20 flex flex-col gap-2">
         <div className="flex justify-between items-center">
             {view === 'home' ? (
                 <h2 className="text-3xl font-bold text-black ml-1">Мои дела</h2>
             ) : (
                 <button onClick={() => { setView('home'); setSelectionMode(false); }} className="flex items-center text-blue-600 font-medium text-[17px] -ml-2"><ChevronLeft size={24} /> Списки</button>
             )}
             <div className="flex gap-3">
                 {view !== 'home' && filteredTasks.length > 0 && <button onClick={() => { setSelectionMode(!selectionMode); setSelectedIds(new Set()); }} className="text-blue-600 font-medium text-[17px]">{selectionMode ? 'Готово' : 'Выбрать'}</button>}
                 {view === 'home' && <button onClick={() => { setShowSearch(!showSearch); setSearch(''); }} className="w-9 h-9 bg-gray-200 rounded-lg flex items-center justify-center"><Search size={20} className="text-gray-600"/></button>}
             </div>
         </div>
         
         {showSearch && <div className="animate-in fade-in slide-in-from-top-2"><input className="w-full bg-white p-3 rounded-xl text-black placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" placeholder="Поиск задач..." value={search} onChange={e => setSearch(e.target.value)} autoFocus /></div>}
         
         {view !== 'home' && (
             <div className="flex justify-between items-end pb-2">
                 <h1 className="text-3xl font-bold text-blue-600">{lists.find(l => l.id === view)?.title || view}</h1>
             </div>
         )}
      </div>

      {/* CONTENT */}
      <div className="flex-1 px-4 pb-36 overflow-y-auto space-y-4">
         {view === 'home' && !search && (
             <>
                <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setView('today')} className="bg-white p-3 rounded-xl shadow-sm flex flex-col justify-between h-[80px] active:scale-95 transition-transform"><div className="flex justify-between w-full"><div className="w-8 h-8 rounded-full flex items-center justify-center bg-blue-500"><CalendarIcon size={18} className="text-white" /></div><span className="text-2xl font-bold text-black">{tasks.filter(t => !t.is_deleted && !t.completed && t.next_run && new Date(t.next_run) < new Date(new Date().setHours(0,0,0,0)+86400000)).length}</span></div><span className="text-gray-500 font-medium text-[15px] self-start">Сегодня</span></button>
                    <button onClick={() => setView('upcoming')} className="bg-white p-3 rounded-xl shadow-sm flex flex-col justify-between h-[80px] active:scale-95 transition-transform"><div className="flex justify-between w-full"><div className="w-8 h-8 rounded-full flex items-center justify-center bg-red-500"><CalendarClock size={18} className="text-white" /></div><span className="text-2xl font-bold text-black">{tasks.filter(t => !t.is_deleted && !t.completed && t.next_run && new Date(t.next_run) >= new Date(new Date().setHours(0,0,0,0)+86400000)).length}</span></div><span className="text-gray-500 font-medium text-[15px] self-start">Запланировано</span></button>
                    <button onClick={() => setView('all')} className="bg-white p-3 rounded-xl shadow-sm flex flex-col justify-between h-[80px] active:scale-95 transition-transform"><div className="flex justify-between w-full"><div className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-500"><Inbox size={18} className="text-white" /></div><span className="text-2xl font-bold text-black">{tasks.filter(t => !t.is_deleted && !t.completed).length}</span></div><span className="text-gray-500 font-medium text-[15px] self-start">Все</span></button>
                    <button onClick={() => setView('flagged')} className="bg-white p-3 rounded-xl shadow-sm flex flex-col justify-between h-[80px] active:scale-95 transition-transform"><div className="flex justify-between w-full"><div className="w-8 h-8 rounded-full flex items-center justify-center bg-orange-500"><Flag size={18} className="text-white" /></div><span className="text-2xl font-bold text-black">{tasks.filter(t => !t.is_deleted && !t.completed && t.is_flagged).length}</span></div><span className="text-gray-500 font-medium text-[15px] self-start">С флажком</span></button>
                </div>
                
                <div>
                    <h2 className="text-xl font-bold text-black mb-2 ml-1">Списки</h2>
                    <div className="bg-white rounded-xl overflow-hidden shadow-sm">
                        {lists.map((l, i) => (
                            <div key={l.id} onClick={() => setView(l.id)} className={`p-3 flex items-center gap-3 active:bg-gray-50 transition cursor-pointer ${i !== lists.length - 1 ? 'border-b border-gray-100' : ''}`}>
                                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center"><ListIcon size={16} className="text-blue-600" /></div>
                                <span className="flex-1 text-[17px] font-medium text-black">{l.title}</span>
                                <span className="text-gray-400 text-[15px]">{tasks.filter(t => t.list_id === l.id && !t.is_deleted && !t.completed).length}</span>
                                <ChevronRight size={16} className="text-gray-300" />
                            </div>
                        ))}
                        <div className={lists.length ? 'border-t border-gray-100' : ''}>
                             <div onClick={() => setView('trash')} className="p-3 flex items-center gap-3 active:bg-gray-50 transition cursor-pointer">
                                 <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><Trash2 size={16} className="text-gray-500" /></div>
                                 <span className="flex-1 text-[17px] font-medium text-black">Недавно удаленные</span>
                                 <ChevronRight size={16} className="text-gray-300" />
                             </div>
                             <div className="border-t border-gray-100"/>
                             <div onClick={() => setActiveModal('listSettings')} className="p-3 flex items-center gap-3 active:bg-gray-50 transition cursor-pointer">
                                 <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><Settings size={16} className="text-gray-500" /></div>
                                 <span className="flex-1 text-[17px] font-medium">Настроить списки</span>
                                 <ChevronRight size={16} className="text-gray-300" />
                             </div>
                        </div>
                    </div>
                </div>
             </>
         )}

         {/* TASKS LIST */}
         {(view !== 'home' || search) && (
             <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => {
                 const { active, over } = e;
                 if (active.id !== over.id) {
                    const oldIndex = filteredTasks.findIndex(t => t.id === active.id);
                    const newIndex = filteredTasks.findIndex(t => t.id === over.id);
                    const newOrder = arrayMove(filteredTasks, oldIndex, newIndex);
                 }
             }}>
                 <SortableContext items={filteredTasks} strategy={verticalListSortingStrategy}>
                    {filteredTasks.length === 0 ? <div className="text-center py-20 text-gray-400">Пусто</div> : filteredTasks.map(t => (
                        <TaskItem 
                            key={t.id} 
                            task={t} 
                            onAction={handleTaskAction} 
                            viewMode={view === 'home' ? 'search' : view}
                            selectionMode={selectionMode}
                            isSelected={selectedIds.has(t.id)}
                            onSelect={(id) => { const s = new Set(selectedIds); if(s.has(id)) s.delete(id); else s.add(id); setSelectedIds(s); }}
                            onEdit={openEditor}
                        />
                    ))}
                 </SortableContext>
             </DndContext>
         )}
      </div>

      {/* FAB */}
      {!selectionMode && !['trash','completed'].includes(view) && (
        <div className="fixed bottom-6 right-6 z-30 animate-in zoom-in">
           <button onClick={openCreator} className="w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center active:scale-90 transition-transform"><Plus size={32} /></button>
        </div>
      )}
      
      {/* MODAL: TASK */}
      {activeModal === 'task' && (
          <Modal onClose={() => setActiveModal(null)}>
              <div className="flex justify-between items-center px-4 py-4 bg-[#F2F2F7] rounded-t-2xl border-b border-gray-200/50">
                  <button onClick={() => setActiveModal(null)} className="text-blue-600 text-[17px]">Отмена</button>
                  <span className="font-bold text-black text-[17px]">{editingId ? 'Правка' : 'Новое'}</span>
                  <button onClick={saveTask} className="text-[17px] font-bold text-blue-600">Готово</button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                  <div className="bg-white rounded-xl overflow-hidden shadow-sm">
                      <input className="w-full p-4 text-[17px] border-b border-gray-100 outline-none bg-white text-black" placeholder="Название" value={newT.title} onChange={e => setNewT({...newT, title: e.target.value})} />
                      <textarea className="w-full p-4 text-[15px] outline-none h-24 bg-white text-black" placeholder="Заметки" value={newT.description} onChange={e => setNewT({...newT, description: e.target.value})} />
                      <div className="relative border-t border-gray-100"><div className="absolute left-4 top-3 text-gray-400"><LinkIcon size={18}/></div><input className="w-full p-3 pl-12 text-[15px] outline-none bg-white text-blue-600" placeholder="URL" value={newT.url} onChange={e => setNewT({...newT, url: e.target.value})} /></div>
                  </div>
                  
                  <div className="bg-white rounded-xl overflow-hidden shadow-sm" onClick={() => setActiveModal('templates')}>
                     <div className="p-3.5 flex justify-between items-center cursor-pointer active:bg-gray-50">
                         <div className="flex items-center gap-3"><div className="w-8 h-8 rounded bg-yellow-400 flex items-center justify-center text-white"><Zap size={18} fill="white"/></div><span className="text-[17px] text-black">Шаблоны</span></div>
                         <ChevronRight size={16} className="text-gray-400" />
                     </div>
                  </div>

                  <div className="bg-white rounded-xl p-4 shadow-sm space-y-3 border border-purple-100">
                      <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-purple-600 font-bold"><Sparkles size={18}/> AI Ассистент</div>
                          <button onClick={saveTemplate} className="text-xs bg-gray-100 px-2 py-1 rounded flex items-center gap-1"><BookmarkPlus size={14}/> Сохранить</button>
                      </div>
                      <input className="w-full bg-purple-50 rounded-lg p-3 text-sm outline-none text-black" placeholder="Уточнение..." value={aiInstruction} onChange={e => setAiInstruction(e.target.value)}/>
                      <button onClick={generateAi} disabled={aiLoading} className="w-full bg-purple-600 text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-50">{aiLoading ? <Loader2 className="animate-spin"/> : <Wand2 size={18}/>} {aiLoading ? 'Думаю...' : 'Сгенерировать'}</button>
                      {aiResult && <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 animate-in fade-in"><div className="text-sm text-gray-700 mb-3 whitespace-pre-wrap">{aiResult}</div><button onClick={() => { setNewT(p => ({...p, description: aiResult})); toast("Вставлено"); }} className="w-full bg-black text-white text-sm font-bold py-2 rounded-lg flex items-center justify-center gap-2"><ArrowDown size={14}/> Вставить</button></div>}
                  </div>
                  
                  <div className="bg-white rounded-xl overflow-hidden shadow-sm space-y-[1px] bg-gray-100">
                      <div className="bg-white p-3.5 flex justify-between items-center"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded bg-red-500 flex items-center justify-center text-white"><CalendarIcon size={18} fill="white" /></div><span className="text-[17px] text-black">Дата</span></div><IOSSwitch checked={newT._hasDate} onChange={v => setNewT(p => ({...p, _hasDate: v}))} /></div>
                      {newT._hasDate && <div className="bg-white px-4 pb-3 animate-fade-in-ios"><input type="date" value={newT._dateVal} onChange={e => setNewT(p => ({...p, _dateVal: e.target.value}))} className="w-full p-2 bg-gray-100 rounded text-blue-600 font-semibold outline-none text-right" /></div>}
                      <div className="bg-white p-3.5 flex justify-between items-center"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded bg-blue-500 flex items-center justify-center text-white"><Clock size={18} fill="white" /></div><span className="text-[17px] text-black">Время</span></div><IOSSwitch checked={newT._hasTime} onChange={v => setNewT(p => ({...p, _hasTime: v}))} /></div>
                      {newT._hasTime && <div className="bg-white px-4 pb-3 animate-fade-in-ios"><input type="time" value={newT._timeVal} onChange={e => setNewT(p => ({...p, _timeVal: e.target.value}))} className="w-full p-2 bg-gray-100 rounded text-blue-600 font-semibold outline-none text-right" /></div>}
                  </div>

                  {/* LIST SELECTOR */}
                  <div className="bg-white rounded-xl overflow-hidden shadow-sm space-y-[1px] bg-gray-100">
                    <div onClick={() => setActiveModal('listPicker')} className="bg-white p-3.5 flex justify-between items-center cursor-pointer active:bg-gray-50">
                        <span className="text-[17px] text-black">Список</span>
                        <div className="flex items-center gap-1 relative">
                             <span className="text-blue-600 text-[17px] mr-1">{lists.find(l => l.id === newT.list_id)?.title || 'Входящие'}</span>
                             <ChevronRight size={16} className="text-gray-400" />
                        </div>
                    </div>
                    <div className="bg-white p-3.5 flex justify-between items-center"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded bg-orange-500 flex items-center justify-center text-white"><Flag size={18} fill="white" /></div><span className="text-[17px] text-black">Флаг</span></div><IOSSwitch checked={newT.is_flagged} onChange={v => setNewT(p => ({...p, is_flagged: v}))} /></div>
                    <div className="bg-white p-3.5 flex justify-between items-center"><span className="text-[17px] text-black">Приоритет</span><div className="flex items-center gap-1"><select className="appearance-none bg-transparent text-gray-500 text-[17px] text-right outline-none pr-6 z-10 relative" value={newT.priority} onChange={e => setNewT(p => ({...p, priority: parseInt(e.target.value)}))}>{['Нет','Низкий','Средний','Высокий'].map((v,i)=><option key={i} value={i}>{v}</option>)}</select><span className="absolute right-9 text-gray-500">{['Нет','!','!!','!!!'][newT.priority]}</span><ChevronRight size={16} className="text-gray-400 absolute right-3" /></div></div>
                    <div onClick={() => setActiveModal('action')} className="bg-white p-3.5 flex justify-between items-center cursor-pointer active:bg-gray-50"><span className="text-[17px] text-black">Действие</span><div className="flex items-center gap-1"><span className="text-blue-600 text-[17px] mr-1">{ACTION_NAMES[newT.type] || 'Нет'}</span><ChevronRight size={16} className="text-gray-400" /></div></div>
                  </div>

                  {editingId && <div className="px-4 pb-6"><button onClick={() => { handleTaskAction('delete', {id: editingId}); setActiveModal(null); }} className="w-full text-red-500 font-bold text-[17px] py-3 bg-white rounded-xl shadow-sm">Удалить напоминание</button></div>}
              </div>
          </Modal>
      )}

      {/* MODAL: LIST SETTINGS */}
      {activeModal === 'listSettings' && (
          <Modal onClose={() => setActiveModal(null)}>
             <div className="flex justify-between items-center px-4 py-4 border-b border-gray-200"><button onClick={() => setActiveModal(null)} className="text-blue-600 font-medium">Закрыть</button><h3 className="font-bold text-black">Списки</h3><button onClick={() => { setNewListTitle(''); setActiveModal('listCreate'); }} className="text-blue-600 font-bold"><Plus size={24}/></button></div>
             <div className="flex-1 overflow-y-auto p-4 space-y-2">
                 {lists.length === 0 && <div className="text-center text-gray-400 mt-10">Нет списков</div>}
                 {lists.map(l => (
                    <div key={l.id} className="relative overflow-hidden rounded-xl mb-2">
                        <div className="absolute inset-y-0 right-0 w-[70px] bg-red-500 flex items-center justify-center text-white z-0 rounded-r-xl"><button className="w-full h-full flex items-center justify-center" onClick={() => modifyList(l, 'delete')}><Trash2 size={20}/></button></div>
                        <div className="relative z-10 bg-white p-4 flex items-center gap-3 active:bg-gray-50 transition-colors rounded-xl shadow-sm" onClick={() => { setNewListTitle(l.title); setEditingListId(l.id); setActiveModal('listCreate'); }}>
                           <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center"><ListIcon size={16} className="text-blue-600" /></div><span className="flex-1 text-[17px] font-medium text-black">{l.title}</span><ChevronRight size={16} className="text-gray-300" />
                        </div>
                    </div>
                 ))}
             </div>
          </Modal>
      )}

       {/* MODAL: TEMPLATES */}
      {activeModal === 'templates' && (
          <Modal onClose={() => setActiveModal('task')}>
             <div className="flex justify-between items-center px-4 py-4 border-b border-gray-200"><button onClick={() => setActiveModal('task')} className="text-blue-600 font-medium">Назад</button><h3 className="font-bold text-black">Шаблоны</h3><div className="w-8"/></div>
             <div className="flex-1 overflow-y-auto p-4 space-y-2">
                 {templates.length===0 && <div className="text-center text-gray-400 mt-10">Нет шаблонов</div>}
                 {templates.map(t => (
                     <div key={t.id} className="group w-full bg-white rounded-xl flex items-center pr-2 overflow-hidden mb-2 shadow-sm">
                         <button onClick={() => { setNewT(p => ({ ...p, title: t.title, description: t.description, type: t.type, url: t.url||'' })); setActiveModal('task'); toast('Применено'); }} className="flex-1 p-3 text-left focus:outline-none">
                             <div className="font-bold text-black">{t.title}</div><div className="text-xs text-gray-500 line-clamp-1">{t.description}</div>
                         </button>
                         <button onClick={() => modifyTemplate(t, 'delete')} className="p-2 text-gray-300 hover:text-red-500"><Trash2 size={18} /></button>
                     </div>
                 ))}
             </div>
          </Modal>
      )}
      
      {/* MODAL: LIST PICKER */}
      {activeModal === 'listPicker' && (
          <Modal onClose={() => setActiveModal('task')}>
              <div className="flex justify-between items-center px-4 py-4 border-b border-gray-200"><button onClick={() => setActiveModal('task')} className="text-blue-600 font-medium">Назад</button><h3 className="font-bold text-black">Выбрать список</h3><div className="w-8"/></div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  <div onClick={() => { setNewT(p => ({...p, list_id: null})); setActiveModal('task'); }} className="bg-white p-3.5 flex items-center justify-between rounded-xl active:bg-gray-50"><span className="text-[17px] text-black">Входящие</span>{newT.list_id === null && <Check size={20} className="text-blue-600"/>}</div>
                  {lists.map(l => (
                      <div key={l.id} onClick={() => { setNewT(p => ({...p, list_id: l.id})); setActiveModal('task'); }} className="bg-white p-3.5 flex items-center justify-between rounded-xl active:bg-gray-50"><span className="text-[17px] text-black">{l.title}</span>{newT.list_id === l.id && <Check size={20} className="text-blue-600"/>}</div>
                  ))}
              </div>
          </Modal>
      )}

      {/* MODAL: ACTION PICKER */}
      {activeModal === 'action' && (
          <Modal onClose={() => setActiveModal('task')}>
              <div className="flex justify-between items-center px-4 py-4 border-b border-gray-200"><button onClick={() => setActiveModal('task')} className="text-blue-600 font-medium">Готово</button><h3 className="font-bold text-black">Действие</h3><div className="w-8"/></div>
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                  <div><h4 className="text-gray-500 text-xs uppercase font-bold mb-2 ml-2">Базовые</h4><div className="bg-white rounded-xl overflow-hidden">{Object.entries(ACTION_NAMES).map(([key, label], i, arr) => (<div key={key} onClick={() => { setNewT(p => ({...p, type: key})); setActiveModal('task'); }} className={`p-3.5 flex items-center gap-3 active:bg-gray-50 ${i!==arr.length-1?'border-b border-gray-100':''}`}>{ACTION_ICONS[key]}<span className="text-[17px] text-black flex-1">{label}</span>{newT.type === key && <Check size={18} className="text-blue-600"/>}</div>))}</div></div>
              </div>
          </Modal>
      )}
      
      {/* MODAL: CREATE LIST */}
      {activeModal === 'listCreate' && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-xs rounded-2xl p-4 shadow-2xl animate-zoom-in-ios">
              <h3 className="text-lg font-bold text-center mb-4 text-black">{editingListId ? 'Название' : 'Новый список'}</h3>
              <div className="bg-gray-100 rounded-xl p-4 mb-4 flex justify-center"><div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center shadow-lg"><ListIcon size={32} className="text-white" /></div></div>
              <input className="w-full bg-gray-100 rounded-lg p-3 text-center text-[17px] font-bold outline-none focus:ring-2 focus:ring-blue-500 mb-4 text-black" placeholder="Название" value={newListTitle} onChange={e => setNewListTitle(e.target.value)} autoFocus />
              <div className="flex gap-2">
                  <button onClick={() => setActiveModal('listSettings')} className="flex-1 py-3 text-gray-500 font-medium hover:bg-gray-50 rounded-lg">Отмена</button>
                  <button onClick={() => { 
                      if(!newListTitle) return; 
                      const l = { title: newListTitle, telegram_user_id: userId, color: '#3B82F6', ...(editingListId ? {id: editingListId} : {}) };
                      modifyList(l); setActiveModal('listSettings'); setNewListTitle(''); setEditingListId(null);
                  }} disabled={!newListTitle} className="flex-1 py-3 text-blue-600 font-bold hover:bg-blue-50 rounded-lg disabled:opacity-50">Готово</button>
              </div>
           </div>
        </div>
      )}

    </div>
  );
};

const ErrorBoundaryWrapper = () => <ErrorBoundary><ToastProvider><MainApp /></ToastProvider></ErrorBoundary>;
export default ErrorBoundaryWrapper;