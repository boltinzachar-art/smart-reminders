import React, { useState, useEffect, useMemo, useRef, createContext, useContext } from 'react';
import { supabase } from './supabaseClient';
import WebApp from '@twa-dev/sdk';
import { 
  Plus, Search, ExternalLink, RefreshCw, RotateCcw, Trash2, GripVertical, 
  CloudOff, ChevronRight, ChevronLeft, Calendar as CalendarIcon, Clock, MapPin, 
  Flag, Camera, CheckCircle2, List as ListIcon, Inbox, CalendarClock, MoreHorizontal, 
  Check, X, Wand2, Loader2, Copy, AlertTriangle, ArrowDown, Sparkles, Settings
} from 'lucide-react';
import { DndContext, closestCenter, useSensor, useSensors, TouchSensor, PointerSensor } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- 1. SYSTEM COMPONENTS ---

const ToastContext = createContext();
const ToastProvider = ({ children }) => {
  const [msg, setMsg] = useState(null);
  const show = (text, type = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 2500);
  };
  return (
    <ToastContext.Provider value={show}>
      {children}
      {msg && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full shadow-lg z-[100] text-sm font-bold animate-fade-in-ios flex items-center gap-2 ${msg.type === 'error' ? 'bg-red-500 text-white' : 'bg-black/80 text-white backdrop-blur'}`}>
          {msg.type === 'error' ? <AlertTriangle size={16}/> : <CheckCircle2 size={16}/>} {msg.text}
        </div>
      )}
    </ToastContext.Provider>
  );
};
const useToast = () => useContext(ToastContext);

class ErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError(error) { return { hasError: true }; }
  render() {
    if (this.state.hasError) return <div className="flex flex-col items-center justify-center h-screen text-gray-500"><AlertTriangle size={48} className="mb-4 text-red-500"/><p>Произошла ошибка.</p><button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg">Перезагрузить</button></div>;
    return this.props.children;
  }
}

// --- 2. UI COMPONENTS ---

const IOSSwitch = ({ checked, onChange }) => (
  <button onClick={() => onChange(!checked)} className={`w-[51px] h-[31px] rounded-full p-0.5 transition-colors duration-300 focus:outline-none ${checked ? 'bg-[#34C759]' : 'bg-[#E9E9EA]'}`}>
    <div className={`w-[27px] h-[27px] bg-white rounded-full shadow-sm transition-transform duration-300 ${checked ? 'translate-x-[20px]' : 'translate-x-0'}`} />
  </button>
);

// --- LOGIC HELPERS ---

const calculateNextRun = (current, freq) => {
  if (!current) return null;
  const d = new Date(current);
  if (freq === 'daily') d.setDate(d.getDate() + 1);
  if (freq === 'weekly') d.setDate(d.getDate() + 7);
  if (freq === 'monthly') d.setMonth(d.getMonth() + 1);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const formatTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
};

const performAction = (e, task) => {
  e.stopPropagation();
  const title = encodeURIComponent(task.title);
  const body = encodeURIComponent(task.description || '');
  
  const actions = {
    email: `mailto:?subject=${title}&body=${body}`,
    whatsapp: `https://wa.me/?text=${body}`,
    web_search: `https://www.google.com/search?q=${title}`
  };
  
  if (actions[task.type]) window.open(actions[task.type]);
};

const SmartListCard = ({ title, count, icon: Icon, color, onClick }) => (
  <button onClick={onClick} className="bg-white p-3 rounded-xl shadow-sm flex flex-col justify-between h-[80px] active:scale-95 transition-transform">
    <div className="flex justify-between w-full">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      <span className="text-2xl font-bold text-black">{count || 0}</span>
    </div>
    <span className="text-gray-500 font-medium text-[15px] self-start">{title}</span>
  </button>
);

const UserListItem = ({ list, count, onClick }) => (
  <div onClick={onClick} className="group bg-white p-3 rounded-xl flex items-center gap-3 active:bg-gray-50 transition-colors cursor-pointer">
    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
      <ListIcon size={16} className="text-blue-600" />
    </div>
    <span className="flex-1 text-[17px] font-medium text-black">{list.title}</span>
    <span className="text-gray-400 text-[15px]">{count || 0}</span>
    <ChevronRight size={16} className="text-gray-300" />
  </div>
);

const TaskItem = ({ task, actions, viewMode, selectionMode, isSelected, onSelect, onEdit }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const [isCompleting, setIsCompleting] = useState(false);
  const timerRef = useRef(null);

  const handleCircleClick = (e) => {
    e.stopPropagation();
    if (selectionMode) { onSelect(task.id); return; }
    if (viewMode === 'completed') { actions.uncomplete(task); return; }
    if (viewMode === 'trash') return;
    
    if (isCompleting) { 
        clearTimeout(timerRef.current); 
        setIsCompleting(false); 
    } else { 
        setIsCompleting(true); 
        timerRef.current = setTimeout(() => { actions.complete(task); setIsCompleting(false); }, 1500); 
    }
  };

  const style = { transform: CSS.Transform.toString(transform), transition: isDragging ? 'none' : 'all 0.3s ease', zIndex: isDragging ? 50 : 'auto', opacity: isDragging ? 0.8 : 1 };
  const isOverdue = task.next_run && new Date(task.next_run) < new Date() && !task.completed;
  
  let circleClass = "mt-0.5 shrink-0 w-[24px] h-[24px] rounded-full border-2 flex items-center justify-center transition-all duration-300 ";
  if (selectionMode) circleClass += isSelected ? "bg-blue-500 border-blue-500" : "border-gray-300 bg-transparent";
  else if (isCompleting) circleClass += "animate-blink-3 border-gray-300";
  else if (task.completed) circleClass += "bg-blue-500 border-blue-500";
  else circleClass += "border-gray-300 hover:border-blue-500 bg-transparent";

  return (
    <div ref={setNodeRef} style={style} onClick={(e) => selectionMode && onSelect(task.id)} className={`group w-full bg-white rounded-xl p-3 shadow-sm flex items-start gap-3 transition-all ${isCompleting ? 'bg-gray-50' : ''} ${isDragging ? 'shadow-xl ring-2 ring-blue-500/20' : ''}`}>
      {!selectionMode && !viewMode.includes('trash') && viewMode !== 'completed' && (
        <div {...attributes} {...listeners} style={{ touchAction: 'none' }} className="mt-1 p-2 -ml-2 text-gray-300 cursor-grab active:cursor-grabbing touch-none"><GripVertical size={20} /></div>
      )}
      {viewMode !== 'trash' ? (
        <button onPointerDown={e => e.stopPropagation()} onClick={handleCircleClick} className={circleClass}>
          {selectionMode && isSelected && <Check size={14} className="text-white" strokeWidth={3} />}
          {!selectionMode && (task.completed || isCompleting) && viewMode !== 'completed' && <div className={`w-2.5 h-2.5 bg-white rounded-full ${isCompleting ? '' : 'animate-in zoom-in'}`} />}
          {!selectionMode && viewMode === 'completed' && <CheckCircle2 size={16} className="text-white" />}
        </button>
      ) : (
        selectionMode ? (
             <button onPointerDown={e => e.stopPropagation()} onClick={handleCircleClick} className={circleClass}>{isSelected && <Check size={14} className="text-white" strokeWidth={3} />}</button>
        ) : (
             <button onClick={() => actions.restore(task.id)} className="mt-0.5 text-blue-600 p-1"><RotateCcw size={20} /></button>
        )
      )}
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-1">
           {task.priority > 0 && <span className="text-blue-600 font-bold text-[17px] mr-1">{'!'.repeat(task.priority)}</span>}
           <div className={`text-[17px] leading-tight break-words ${task.completed || isCompleting ? 'text-gray-400' : 'text-black'}`}>{task.title}</div>
           {task.is_flagged && <Flag size={14} className="text-orange-500 fill-orange-500 ml-1" />}
        </div>
        {task.description && <p className="text-gray-400 font-semibold text-[13px] mt-1 line-clamp-2 leading-snug break-words">{task.description}</p>}
        <div className="flex items-center flex-wrap gap-2 mt-1.5">
          {task.next_run && <span className={`text-xs font-semibold ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>{
             new Date(task.next_run).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
          }</span>}
          {task.frequency !== 'once' && <span className="text-gray-400 flex items-center text-xs gap-0.5 font-medium"><RefreshCw size={10} /> {task.frequency}</span>}
          {task.type !== 'reminder' && (
            <button onPointerDown={e => e.stopPropagation()} onClick={(e) => performAction(e, task)} className="ml-auto text-blue-600 text-xs font-bold flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded"><ExternalLink size={10}/> {task.type}</button>
          )}
        </div>
      </div>
      {!selectionMode && !viewMode.includes('trash') && (
          <div className="flex gap-1">
             <button onPointerDown={e => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onEdit(task); }} className="text-gray-400 p-1 hover:bg-gray-100 rounded-full"><MoreHorizontal size={20} /></button>
          </div>
      )}
    </div>
  );
};

// --- 3. MAIN LOGIC ---

const MainApp = () => {
  const toast = useToast();
  const [view, setView] = useState('home');
  const [tasks, setTasks] = useState(() => JSON.parse(localStorage.getItem('tasks') || '[]'));
  const [lists, setLists] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [userId, setUserId] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  
  // Modals
  const [taskModal, setTaskModal] = useState(false);
  const [listModal, setListModal] = useState(false);
  const [editingListId, setEditingListId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  
  // AI State (ИСПРАВЛЕНО: теперь это отдельные переменные)
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');

  const [newT, setNewT] = useState({ title: '', description: '', type: 'reminder', frequency: 'once', priority: 0, is_flagged: false });
  const [hasDate, setHasDate] = useState(false);
  const [hasTime, setHasTime] = useState(false);
  const [dateVal, setDateVal] = useState(new Date().toISOString().slice(0, 10));
  const [timeVal, setTimeVal] = useState(new Date().toTimeString().slice(0, 5));
  const [newListTitle, setNewListTitle] = useState('');
  const [search, setSearch] = useState('');

  const sensors = useSensors(useSensor(PointerSensor), useSensor(TouchSensor, { activationConstraint: { tolerance: 5 } }));

  useEffect(() => {
    const handleStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleStatus); window.addEventListener('offline', handleStatus);
    if (WebApp.initDataUnsafe.user) {
      setUserId(WebApp.initDataUnsafe.user.id);
      WebApp.expand(); try{WebApp.disableVerticalSwipes()}catch{} WebApp.enableClosingConfirmation();
      WebApp.setHeaderColor('#F2F2F7'); WebApp.setBackgroundColor('#F2F2F7');
    } else { setUserId(777); }
    return () => { window.removeEventListener('online', handleStatus); window.removeEventListener('offline', handleStatus); };
  }, []);

  useEffect(() => { localStorage.setItem('tasks', JSON.stringify(tasks)); }, [tasks]);

  useEffect(() => {
    if (!userId || !isOnline) return;
    const fetchData = async () => {
      const { data: t } = await supabase.from('tasks').select('*').eq('telegram_user_id', userId).order('position');
      if (t) {
         const local = tasks.filter(x => x.id.toString().startsWith('temp-'));
         const map = new Map(); t.forEach(x => map.set(x.id, x)); local.forEach(x => map.set(x.id, x));
         setTasks(Array.from(map.values()).sort((a,b) => a.position - b.position));
      }
      const { data: l } = await supabase.from('lists').select('*').eq('telegram_user_id', userId);
      if (l) setLists(l);
    };
    fetchData(); const i = setInterval(fetchData, 30000); return () => clearInterval(i);
  }, [userId, isOnline]);

  const actions = {
    saveTask: async () => {
      if (!newT.title) { toast("Введите название", "error"); return; }
      let finalDate = hasDate ? (dateVal + (hasTime ? 'T' + timeVal : 'T09:00')) : null;
      
      if (editingId) {
          setTasks(p => p.map(t => t.id === editingId ? { ...t, ...newT, next_run: finalDate } : t));
          if (isOnline && !editingId.toString().startsWith('temp-')) {
              const { id, ...upd } = { ...newT, next_run: finalDate };
              await supabase.from('tasks').update(upd).eq('id', editingId);
          }
          toast("Сохранено");
      } else {
          const tempId = 'temp-' + Date.now();
          const listId = ['home','today','all','upcoming','flagged','trash','completed'].includes(view) ? null : view;
          const task = { ...newT, next_run: finalDate, telegram_user_id: userId, status: 'active', completed: false, is_deleted: false, position: tasks.length, id: tempId, list_id: listId };
          setTasks(p => [...p, task]);
          if (isOnline) {
            const { id, ...db } = task;
            const { data } = await supabase.from('tasks').insert([db]).select();
            if (data) setTasks(p => p.map(t => t.id === tempId ? data[0] : t));
          }
          toast("Создано");
      }
      closeModal();
    },
    saveList: async () => {
      if (!newListTitle) return;
      if (editingListId) {
          setLists(prev => prev.map(l => l.id === editingListId ? { ...l, title: newListTitle } : l));
          if (isOnline) await supabase.from('lists').update({ title: newListTitle }).eq('id', editingListId);
          toast("Переименовано");
      } else {
          const l = { title: newListTitle, telegram_user_id: userId, color: '#3B82F6' };
          const { data } = await supabase.from('lists').insert([l]).select();
          if (data) { setLists(p => [...p, data[0]]); toast("Список создан"); }
      }
      setListModal(false); setNewListTitle(''); setEditingListId(null);
    },
    deleteList: async () => {
        if (!editingListId) return;
        if (!confirm("Удалить список и все задачи?")) return;
        setTasks(prev => prev.filter(t => t.list_id !== editingListId));
        setLists(prev => prev.filter(l => l.id !== editingListId));
        setView('home'); setListModal(false); setNewListTitle(''); setEditingListId(null);
        if (isOnline) await supabase.from('lists').delete().eq('id', editingListId);
        toast("Список удален");
    },
    openListModal: (listId = null) => {
        if (listId) {
            const list = lists.find(l => l.id === listId);
            setNewListTitle(list.title); setEditingListId(listId);
        } else { setNewListTitle(''); setEditingListId(null); }
        setListModal(true);
    },
    complete: async (task) => {
      const isRec = task.frequency !== 'once' && task.next_run;
      const nextDate = isRec ? (() => {
          const d = new Date(task.next_run);
          if(task.frequency==='daily') d.setDate(d.getDate()+1);
          if(task.frequency==='weekly') d.setDate(d.getDate()+7);
          if(task.frequency==='monthly') d.setMonth(d.getMonth()+1);
          return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
      })() : null;

      setTasks(p => p.map(t => t.id === task.id ? (isRec ? { ...t, next_run: nextDate } : { ...t, completed: true }) : t));
      if (isOnline && !task.id.toString().startsWith('temp-')) {
        await supabase.from('tasks').update(isRec ? { next_run: nextDate } : { completed: true }).eq('id', task.id);
      }
      toast(isRec ? "Перенесено" : "Выполнено");
    },
    uncomplete: async (task) => {
        setTasks(p => p.map(t => t.id === task.id ? { ...t, completed: false } : t));
        if (isOnline && !task.id.toString().startsWith('temp-')) await supabase.from('tasks').update({ completed: false }).eq('id', task.id);
    },
    restore: async (id) => {
      setTasks(p => p.map(t => t.id === id ? { ...t, is_deleted: false } : t));
      if (isOnline) await supabase.from('tasks').update({ is_deleted: false }).eq('id', id);
      toast("Восстановлено");
    },
    delete: async (id) => {
        if (view === 'trash') {
           if (!confirm('Удалить навсегда?')) return;
           setTasks(p => p.filter(t => t.id !== id));
           if (isOnline) await supabase.from('tasks').delete().eq('id', id);
        } else {
           setTasks(p => p.map(t => t.id === id ? { ...t, is_deleted: true } : t));
           if (isOnline) await supabase.from('tasks').update({ is_deleted: true }).eq('id', id);
           toast("В корзине");
        }
    },
    reorder: (e) => {
      const { active, over } = e;
      if (active.id !== over.id) {
        setTasks(items => {
          const n = arrayMove(items, items.findIndex(t => t.id === active.id), items.findIndex(t => t.id === over.id));
          if (isOnline) {
             const upd = n.map((t, i) => ({ id: t.id, position: i, title: t.title, telegram_user_id: userId })).filter(t => !t.id.toString().startsWith('temp-'));
             supabase.from('tasks').upsert(upd).then();
          }
          return n;
        });
      }
    },
    bulkAction: async (type) => {
        if (selectedIds.size === 0) return;
        const ids = Array.from(selectedIds);
        if (type === 'delete') {
            if (!confirm('Удалить выбранные?')) return;
            if (view === 'trash') {
                setTasks(p => p.filter(t => !selectedIds.has(t.id)));
                if (isOnline) await supabase.from('tasks').delete().in('id', ids);
            } else {
                setTasks(p => p.map(t => selectedIds.has(t.id) ? { ...t, is_deleted: true } : t));
                if (isOnline) await supabase.from('tasks').update({ is_deleted: true }).in('id', ids);
            }
        } else if (type === 'restore') {
            setTasks(p => p.map(t => selectedIds.has(t.id) ? { ...t, is_deleted: false } : t));
            if (isOnline) await supabase.from('tasks').update({ is_deleted: false }).in('id', ids);
        }
        setSelectionMode(false); setSelectedIds(new Set()); toast("Готово");
    },
    clearAll: async () => {
        if (!confirm('Очистить список?')) return;
        const ids = filteredTasks.map(t => t.id);
        if (view === 'trash') {
             setTasks(p => p.filter(t => !ids.includes(t.id)));
             if (isOnline) await supabase.from('tasks').delete().in('id', ids);
        } else {
             setTasks(p => p.map(t => ids.includes(t.id) ? { ...t, is_deleted: true } : t));
             if (isOnline) await supabase.from('tasks').update({ is_deleted: true }).in('id', ids);
        }
        toast("Список очищен");
    },
    generateAi: async () => {
        if (!newT.title) { toast("Напишите название для ИИ", "error"); return; }
        setAiLoading(true);
        setAiResult('');
        try {
            const { data, error } = await supabase.functions.invoke('ai-assistant', {
                body: { 
                    taskTitle: newT.title, 
                    taskDescription: newT.description, 
                    type: newT.type,
                    customInstruction: aiInstruction 
                }
            });
            if (error) throw error;
            setAiResult(data.result);
        } catch (e) {
            toast("Ошибка AI", "error");
        } finally {
            setAiLoading(false);
        }
    }
  };

  const openEditModal = (task) => {
      setEditingId(task.id);
      setNewT({ title: task.title, description: task.description, type: task.type || 'reminder', frequency: task.frequency || 'once', priority: task.priority || 0, is_flagged: task.is_flagged || false });
      setAiInstruction(''); setAiResult('');
      if (task.next_run) {
          const d = new Date(task.next_run);
          setHasDate(true); setDateVal(d.toISOString().slice(0, 10));
          setHasTime(task.next_run.includes('T') && !task.next_run.endsWith('T09:00')); 
          if (task.next_run.includes('T')) setTimeVal(d.toTimeString().slice(0, 5));
      } else { setHasDate(false); setHasTime(false); }
      setTaskModal(true);
  };

  const closeModal = () => {
      setTaskModal(false); setEditingId(null);
      setNewT({ title: '', description: '', type: 'reminder', frequency: 'once', priority: 0, is_flagged: false });
      setHasDate(false); setHasTime(false);
      setAiInstruction(''); setAiResult('');
  };

  const filteredTasks = useMemo(() => {
    let res = tasks;
    if (search) {
        const l = search.toLowerCase();
        res = res.filter(t => t.title.toLowerCase().includes(l) || (t.next_run && formatTime(t.next_run).toLowerCase().includes(l)));
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

  const counts = {
    today: tasks.filter(t => !t.is_deleted && !t.completed && t.next_run && new Date(t.next_run) >= new Date().setHours(0,0,0,0) && new Date(t.next_run) < new Date().setHours(0,0,0,0)+86400000).length,
    upcoming: tasks.filter(t => !t.is_deleted && !t.completed && t.next_run && new Date(t.next_run) >= new Date().setHours(0,0,0,0)+86400000).length,
    all: tasks.filter(t => !t.is_deleted && !t.completed).length,
    flagged: tasks.filter(t => !t.is_deleted && !t.completed && t.is_flagged).length,
  };

  const scheduledSections = useMemo(() => {
      if(view !== 'upcoming') return [];
      const today = new Date(); today.setHours(0,0,0,0);
      const res = [];
      const overdue = filteredTasks.filter(t => t.next_run && new Date(t.next_run) < today);
      if(overdue.length) res.push({title:'Просрочено', data:overdue, isOverdue: true});
      
      for(let i=0; i<=14; i++){
          const d = new Date(today); d.setDate(today.getDate()+i);
          const s = d.getTime(), e = s + 86400000;
          const dt = filteredTasks.filter(t => { if(!t.next_run)return false; const tm=new Date(t.next_run).getTime(); return tm>=s && tm<e; });
          let title = d.toLocaleDateString('ru-RU',{day:'numeric',month:'long',weekday:'short'});
          if(i===0)title='Сегодня'; if(i===1)title='Завтра';
          res.push({title, data:dt, compact: dt.length===0});
      }
      const fut = new Date(today); fut.setDate(today.getDate()+15);
      const futT = filteredTasks.filter(t => t.next_run && new Date(t.next_run) >= fut);
      if(futT.length) res.push({title:'Позже', data:futT});
      return res;
  }, [filteredTasks, view]);

  const isCustomList = !['home', 'today', 'upcoming', 'all', 'flagged', 'trash', 'completed'].includes(view);

  return (
    <div className="min-h-[100dvh] w-full bg-[#F2F2F7] text-black font-sans flex flex-col overflow-hidden">
      {view === 'home' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-6 animate-in slide-in-from-left-4 duration-300">
          <div className="relative bg-[#E3E3E8] rounded-xl flex items-center px-3 py-2">
            <Search className="text-gray-400" size={18} />
            <input className="w-full bg-transparent pl-2 text-black placeholder-gray-500 outline-none" placeholder="Поиск (задача, дата)" value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch('')}><X size={16} className="text-gray-400"/></button>}
          </div>
          {!search ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <SmartListCard title="Сегодня" count={counts.today} icon={CalendarIcon} color="bg-blue-500" onClick={() => setView('today')} />
                <SmartListCard title="Запланировано" count={counts.upcoming} icon={CalendarClock} color="bg-red-500" onClick={() => setView('upcoming')} />
                <SmartListCard title="Все" count={counts.all} icon={Inbox} color="bg-gray-500" onClick={() => setView('all')} />
                <SmartListCard title="С флажком" count={counts.flagged} icon={Flag} color="bg-orange-500" onClick={() => setView('flagged')} />
              </div>
              <div>
                 <h2 className="text-xl font-bold text-black mb-2 ml-1">Мои списки</h2>
                 <div className="bg-white rounded-xl overflow-hidden shadow-sm">
                   {lists.map((l, i) => (<div key={l.id} className={i!==lists.length-1?'border-b border-gray-100':''}><UserListItem list={l} count={tasks.filter(t=>t.list_id===l.id&&!t.is_deleted&&!t.completed).length} onClick={()=>setView(l.id)}/></div>))}
                   <div className={lists.length?'border-t border-gray-100':''}>
                        <div onClick={()=>setView('completed')} className="group bg-white p-3 flex items-center gap-3 active:bg-gray-50 transition cursor-pointer"><div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><CheckCircle2 size={16} className="text-gray-500"/></div><span className="flex-1 text-[17px] font-medium">Выполнено</span><ChevronRight size={16} className="text-gray-300"/></div>
                        <div className="border-t border-gray-100"/>
                        <div onClick={()=>setView('trash')} className="group bg-white p-3 flex items-center gap-3 active:bg-gray-50 transition cursor-pointer"><div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><Trash2 size={16} className="text-gray-500"/></div><span className="flex-1 text-[17px] font-medium">Недавно удаленные</span><ChevronRight size={16} className="text-gray-300"/></div>
                   </div>
                 </div>
              </div>
              <div className="flex justify-end"><button onClick={() => actions.openListModal()} className="text-blue-600 font-medium text-lg p-2">Добавить список</button></div>
            </>
          ) : (
              <div className="space-y-2">{filteredTasks.map(t => <TaskItem key={t.id} task={t} actions={actions} viewMode="search" onEdit={openEditModal}/>)}</div>
          )}
        </div>
      )}

      {view !== 'home' && (
        <div className="flex-1 flex flex-col h-full animate-in slide-in-from-right-8 duration-300 relative">
          <div className="px-4 pt-2 pb-2 bg-[#F2F2F7] sticky top-0 z-20 flex items-center justify-between">
             <div className="flex items-center gap-2"><button onClick={() => {setView('home'); setSelectionMode(false);}} className="flex items-center text-blue-600 font-medium text-[17px] -ml-2"><ChevronLeft size={24} /> Списки</button></div>
             <div className="flex items-center gap-4">
                 {isCustomList && <button onClick={() => actions.openListModal(view)} className="text-blue-600"><Settings size={22}/></button>}
                 {filteredTasks.length > 0 && <button onClick={() => {setSelectionMode(!selectionMode); setSelectedIds(new Set());}} className="text-blue-600 font-medium text-[17px]">{selectionMode ? 'Готово' : 'Выбрать'}</button>}
             </div>
          </div>
          <div className="px-4 pb-4 flex justify-between items-end">
             <h1 className="text-3xl font-bold text-blue-600">{view === 'today' ? 'Сегодня' : view === 'upcoming' ? 'Запланировано' : view === 'all' ? 'Все' : view === 'flagged' ? 'С флажком' : view === 'trash' ? 'Корзина' : view === 'completed' ? 'Выполнено' : lists.find(l=>l.id===view)?.title || 'Список'}</h1>
             {(view === 'trash' || view === 'completed') && filteredTasks.length > 0 && !selectionMode && <button onClick={actions.clearAll} className="text-red-500 text-sm font-medium bg-white/50 px-3 py-1 rounded-lg shadow-sm">Очистить</button>}
          </div>

          <div className="flex-1 px-4 pb-36 overflow-y-auto space-y-3">
             {view === 'upcoming' && !selectionMode ? (
                 <div className="pb-20">{scheduledSections.map((s,i) => (
                    <div key={i} className={`mb-2 ${s.compact?'opacity-50':''}`}>
                        <div className={`px-4 py-2 font-bold text-lg flex justify-between ${s.isOverdue?'text-red-500':'text-black'} ${s.compact?'text-sm py-1':''}`}><span>{s.title}</span></div>
                        {!s.compact && <div className="px-4 space-y-2">{s.data.map(t => <TaskItem key={t.id} task={t} actions={actions} viewMode="scheduled" onEdit={openEditModal} />)}</div>}
                    </div>
                 ))}</div>
             ) : (
                 <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={actions.reorder}>
                    <SortableContext items={filteredTasks} strategy={verticalListSortingStrategy}>
                        {filteredTasks.length === 0 ? <div className="text-center py-20 text-gray-400">Нет напоминаний</div> : filteredTasks.map(t => (
                            <TaskItem key={t.id} task={t} actions={actions} viewMode={view} selectionMode={selectionMode} isSelected={selectedIds.has(t.id)} onSelect={actions.toggleSelect} onEdit={openEditModal}/>
                        ))}
                    </SortableContext>
                 </DndContext>
             )}
          </div>

          {!selectionMode && !['trash','completed'].includes(view) && (
            <div className="fixed bottom-6 right-6 z-30">
               <button onClick={() => setTaskModal(true)} className="w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center active:scale-90 transition-transform">
                  <Plus size={32} />
               </button>
            </div>
          )}
          {selectionMode && (
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F2F2F7] border-t border-gray-200 z-30 flex justify-between items-center">
                <div className="text-gray-500 font-medium">Выбрано: {selectedIds.size}</div>
                <div className="flex gap-4">
                    {view === 'trash' ? <button onClick={() => actions.bulkAction('restore')} disabled={!selectedIds.size} className="text-blue-600 font-bold disabled:text-gray-400">Восстановить</button> : <div/>}
                    <button onClick={() => actions.bulkAction('delete')} disabled={!selectedIds.size} className="text-red-500 font-bold disabled:text-gray-300">Удалить</button>
                </div>
            </div>
          )}
        </div>
      )}

      {/* TASK MODAL */}
      {taskModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
           <div className="bg-[#F2F2F7] w-full sm:max-w-md rounded-t-2xl h-[90vh] flex flex-col shadow-2xl animate-slide-up-ios">
              <div className="flex justify-between items-center px-4 py-4 bg-[#F2F2F7] rounded-t-2xl border-b border-gray-200/50">
                 <button onClick={closeModal} className="text-blue-600 text-[17px]">Отмена</button>
                 <span className="font-bold text-black text-[17px]">{editingId ? 'Правка' : 'Новое'}</span>
                 <button onClick={actions.saveTask} className={`text-[17px] font-bold ${newT.title ? 'text-blue-600' : 'text-gray-400'}`}>{editingId ? 'Готово' : 'Добавить'}</button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                 <div className="bg-white rounded-xl overflow-hidden shadow-sm"><input className="w-full p-4 text-[17px] border-b border-gray-100 outline-none placeholder-gray-400 text-black" placeholder="Название" value={newT.title} onChange={e => setNewT({...newT, title: e.target.value})} autoFocus /><textarea className="w-full p-4 text-[15px] outline-none resize-none h-24 placeholder-gray-400 text-black" placeholder="Заметки" value={newT.description} onChange={e => setNewT({...newT, description: e.target.value})} /></div>
                 
                 {/* AI BLOCK */}
                 <div className="bg-white rounded-xl p-4 shadow-sm space-y-3 border border-purple-100">
                    <div className="flex items-center gap-2 text-purple-600 font-bold"><Sparkles size={18}/> Текст действия (AI)</div>
                    <input className="w-full bg-purple-50 rounded-lg p-3 text-sm outline-none placeholder-purple-300 text-black" placeholder="Уточнение (например: вежливо для жильцов)" value={aiInstruction} onChange={e => setAiInstruction(e.target.value)}/>
                    <button onClick={actions.generateAi} disabled={aiLoading} className="w-full bg-purple-600 text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-50">{aiLoading ? <Loader2 className="animate-spin"/> : <Wand2 size={18}/>} {aiLoading ? 'Думаю...' : 'Сгенерировать'}</button>
                    {aiResult && (
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 animate-in fade-in">
                            <div className="text-sm text-gray-700 mb-3 whitespace-pre-wrap">{aiResult}</div>
                            <button onClick={() => { setNewT(p => ({...p, description: aiResult})); toast("Вставлено в заметки"); }} className="w-full bg-black text-white text-sm font-bold py-2 rounded-lg flex items-center justify-center gap-2 active:scale-95 transition"><ArrowDown size={14}/> Вставить в заметки</button>
                        </div>
                    )}
                 </div>

                 <div className="bg-white rounded-xl overflow-hidden shadow-sm space-y-[1px] bg-gray-100">
                    <div className="bg-white p-3.5 flex justify-between items-center"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded bg-red-500 flex items-center justify-center text-white"><CalendarIcon size={18} fill="white" /></div><span className="text-[17px] text-black">Дата</span></div><IOSSwitch checked={hasDate} onChange={setHasDate} /></div>
                    {hasDate && <div className="bg-white px-4 pb-3 animate-fade-in-ios"><input type="date" value={dateVal} onChange={e => setDateVal(e.target.value)} className="w-full p-2 bg-gray-100 rounded text-blue-600 font-semibold outline-none text-right" /></div>}
                    <div className="bg-white p-3.5 flex justify-between items-center"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded bg-blue-500 flex items-center justify-center text-white"><Clock size={18} fill="white" /></div><span className="text-[17px] text-black">Время</span></div><IOSSwitch checked={hasTime} onChange={(val) => { setHasTime(val); if(val && !hasDate) setHasDate(true); }} /></div>
                    {hasTime && <div className="bg-white px-4 pb-3 animate-fade-in-ios"><input type="time" value={timeVal} onChange={e => setTimeVal(e.target.value)} className="w-full p-2 bg-gray-100 rounded text-blue-600 font-semibold outline-none text-right" /></div>}
                 </div>
                 <div className="bg-white rounded-xl overflow-hidden shadow-sm space-y-[1px] bg-gray-100">
                    <div className="bg-white p-3.5 flex justify-between items-center"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded bg-orange-500 flex items-center justify-center text-white"><Flag size={18} fill="white" /></div><span className="text-[17px] text-black">Флаг</span></div><IOSSwitch checked={newT.is_flagged} onChange={v => setNewT({...newT, is_flagged: v})} /></div>
                    <div className="bg-white p-3.5 flex justify-between items-center"><span className="text-[17px] text-black">Приоритет</span><div className="flex items-center gap-1"><select className="appearance-none bg-transparent text-gray-500 text-[17px] text-right outline-none pr-6 z-10 relative" value={newT.priority} onChange={e => setNewT({...newT, priority: parseInt(e.target.value)})}>{['Нет','Низкий','Средний','Высокий'].map((v,i)=><option key={i} value={i}>{v}</option>)}</select><span className="absolute right-9 text-gray-500">{['Нет','!','!!','!!!'][newT.priority]}</span><ChevronRight size={16} className="text-gray-400 absolute right-3" /></div></div>
                    <div className="bg-white p-3.5 flex justify-between items-center"><span className="text-[17px] text-black">Действие</span><div className="flex items-center gap-1 relative"><select className="appearance-none bg-transparent text-gray-500 text-[17px] text-right outline-none pr-6 z-10 relative" value={newT.type} onChange={e => setNewT({...newT, type: e.target.value})}><option value="reminder">Нет</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="web_search">Поиск</option></select><ChevronRight size={16} className="text-gray-400 absolute right-0" /></div></div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {listModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-xs rounded-2xl p-4 shadow-2xl animate-zoom-in-ios">
              <h3 className="text-lg font-bold text-center mb-4">{editingListId ? 'Название списка' : 'Новый список'}</h3>
              <div className="bg-gray-100 rounded-xl p-4 mb-4 flex justify-center"><div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center shadow-lg"><ListIcon size={32} className="text-white" /></div></div>
              <input className="w-full bg-gray-100 rounded-lg p-3 text-center text-[17px] font-bold outline-none focus:ring-2 focus:ring-blue-500 mb-4" placeholder="Название списка" value={newListTitle} onChange={e => setNewListTitle(e.target.value)} autoFocus />
              <div className="flex gap-2">
                  <button onClick={() => setListModal(false)} className="flex-1 py-3 text-gray-500 font-medium hover:bg-gray-50 rounded-lg">Отмена</button>
                  <button onClick={actions.saveList} disabled={!newListTitle} className="flex-1 py-3 text-blue-600 font-bold hover:bg-blue-50 rounded-lg disabled:opacity-50">Готово</button>
              </div>
              {editingListId && (
                  <button onClick={actions.deleteList} className="w-full mt-2 py-2 text-red-500 text-sm font-medium">Удалить список</button>
              )}
           </div>
        </div>
      )}
    </div>
  );
};

export default () => (
  <React.StrictMode>
    <ErrorBoundary><ToastProvider><MainApp /></ToastProvider></ErrorBoundary>
  </React.StrictMode>
);