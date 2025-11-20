import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from './supabaseClient';
import WebApp from '@twa-dev/sdk';
import { 
  Plus, Search, ExternalLink, RefreshCw, RotateCcw, Trash2, GripVertical, 
  CloudOff, ChevronRight, ChevronLeft, Calendar as CalendarIcon, Clock, MapPin, 
  Flag, Camera, CheckCircle2, List, Inbox, CalendarClock, MoreHorizontal, Check, X
} from 'lucide-react';
import { DndContext, closestCenter, useSensor, useSensors, TouchSensor, PointerSensor } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- IOS SWITCH ---
const IOSSwitch = ({ checked, onChange }) => (
  <button onClick={() => onChange(!checked)} className={`w-[51px] h-[31px] rounded-full p-0.5 transition-colors duration-300 focus:outline-none ${checked ? 'bg-[#34C759]' : 'bg-[#E9E9EA]'}`}>
    <div className={`w-[27px] h-[27px] bg-white rounded-full shadow-sm transition-transform duration-300 ${checked ? 'translate-x-[20px]' : 'translate-x-0'}`} />
  </button>
);

// --- HELPERS ---
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

const getPriorityMarks = (p) => {
  if (p === 1) return '!';
  if (p === 2) return '!!';
  if (p === 3) return '!!!';
  return null;
};

const performAction = (e, task) => {
  e.stopPropagation();
  const text = encodeURIComponent(task.title + (task.description ? `\n${task.description}` : ''));
  const actions = {
    email: `mailto:?subject=${encodeURIComponent(task.title)}&body=${text}`,
    whatsapp: `https://wa.me/?text=${text}`,
    web_search: `https://www.google.com/search?q=${encodeURIComponent(task.title)}`
  };
  if (actions[task.type]) window.open(actions[task.type]);
};

// --- SUB-COMPONENTS ---
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
      <List size={16} className="text-blue-600" />
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
    if (isCompleting) { clearTimeout(timerRef.current); setIsCompleting(false); } 
    else { setIsCompleting(true); timerRef.current = setTimeout(() => { actions.complete(task); setIsCompleting(false); }, 1500); }
  };

  const style = { transform: CSS.Transform.toString(transform), transition: isDragging ? 'none' : 'all 0.3s ease', zIndex: isDragging ? 50 : 'auto', opacity: isDragging ? 0.8 : 1 };
  const isOverdue = task.next_run && new Date(task.next_run) < new Date() && !task.completed;
  const isTrash = viewMode === 'trash';
  const priorityMarks = getPriorityMarks(task.priority);
  
  let circleClass = "mt-0.5 shrink-0 w-[24px] h-[24px] rounded-full border-2 flex items-center justify-center transition-all duration-300 ";
  if (selectionMode) {
      circleClass += isSelected ? "bg-blue-500 border-blue-500" : "border-gray-300 bg-transparent";
  } else {
      if (isCompleting) circleClass += "animate-blink-3 border-gray-300"; 
      else if (task.completed) circleClass += "bg-blue-500 border-blue-500";
      else circleClass += "border-gray-300 hover:border-blue-500 bg-transparent";
  }

  return (
    <div ref={setNodeRef} style={style} onClick={(e) => selectionMode && onSelect(task.id)} className={`group w-full bg-white rounded-xl p-3 shadow-sm flex items-start gap-3 transition-all ${isCompleting ? 'bg-gray-50' : ''} ${isDragging ? 'shadow-xl ring-2 ring-blue-500/20' : ''}`}>
      {!isTrash && viewMode !== 'completed' && !selectionMode && (
        <div {...attributes} {...listeners} style={{ touchAction: 'none' }} className="mt-1 p-2 -ml-2 text-gray-300 cursor-grab active:cursor-grabbing touch-none"><GripVertical size={20} /></div>
      )}
      {!isTrash ? (
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
           {priorityMarks && <span className="text-blue-600 font-bold text-[17px] mr-1">{priorityMarks}</span>}
           <div className={`text-[17px] leading-tight break-words transition-colors ${task.completed || isCompleting ? 'text-gray-400' : 'text-black'}`}>{task.title}</div>
           {task.is_flagged && <Flag size={14} className="text-orange-500 fill-orange-500 ml-1" />}
        </div>
        {task.description && <p className="text-gray-400 font-semibold text-[13px] mt-1 line-clamp-2 leading-snug break-words">{task.description}</p>}
        <div className="flex items-center flex-wrap gap-2 mt-1.5">
          {task.next_run && <span className={`text-xs font-semibold ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>{formatTime(task.next_run)}</span>}
          {task.frequency !== 'once' && <span className="text-gray-400 flex items-center text-xs gap-0.5 font-medium"><RefreshCw size={10} /> {task.frequency}</span>}
          {task.type !== 'reminder' && (
            <button onPointerDown={e => e.stopPropagation()} onClick={(e) => performAction(e, task)} className="ml-auto text-blue-600 text-xs font-bold flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded"><ExternalLink size={10}/> {task.type}</button>
          )}
        </div>
      </div>
      {!selectionMode && (
          <button onPointerDown={e => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onEdit(task); }} className="text-gray-400 p-1 hover:bg-gray-100 rounded-full"><MoreHorizontal size={20} /></button>
      )}
    </div>
  );
};

// --- SPECIAL VIEW: SCHEDULED (SECTIONS) ---
const ScheduledView = ({ tasks, actions, onEdit }) => {
  const sections = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const result = [];
    const overdue = tasks.filter(t => t.next_run && new Date(t.next_run) < today);
    if (overdue.length > 0) result.push({ title: 'Просрочено', data: overdue, isOverdue: true });

    for (let i = 0; i <= 14; i++) {
        const d = new Date(today); d.setDate(today.getDate() + i);
        const dayStart = d.getTime(); const dayEnd = dayStart + 86400000;
        const dayTasks = tasks.filter(t => {
            if (!t.next_run) return false;
            const tTime = new Date(t.next_run).getTime();
            return tTime >= dayStart && tTime < dayEnd;
        });
        let title = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' });
        if (i === 0) title = 'Сегодня'; if (i === 1) title = 'Завтра';
        result.push({ title: title, data: dayTasks.sort((a,b) => new Date(a.next_run) - new Date(b.next_run)), isCompact: dayTasks.length === 0 });
    }
    const futureStart = new Date(today); futureStart.setDate(today.getDate() + 15);
    const futureTasks = tasks.filter(t => t.next_run && new Date(t.next_run) >= futureStart);
    if (futureTasks.length > 0) {
        result.push({ title: 'Позже', data: futureTasks.sort((a,b) => new Date(a.next_run) - new Date(b.next_run)) });
    }
    return result;
  }, [tasks]);

  return (
    <div className="pb-40">
        {sections.map((section, idx) => (
            <div key={idx} className={`mb-2 ${section.isCompact ? 'opacity-50' : ''}`}>
                <div className={`px-4 py-2 font-bold text-lg flex justify-between ${section.isOverdue ? 'text-red-500' : 'text-black'} ${section.isCompact ? 'text-sm py-1' : ''}`}>
                    <span>{section.title}</span>
                </div>
                {!section.isCompact && <div className="px-4 space-y-2">{section.data.map(task => <TaskItem key={task.id} task={task} actions={actions} viewMode="scheduled" onEdit={onEdit} />)}</div>}
            </div>
        ))}
    </div>
  );
};

// --- MAIN APP COMPONENT ---
const App = () => {
  const [view, setView] = useState('home');
  const [tasks, setTasks] = useState(() => JSON.parse(localStorage.getItem('tasks') || '[]'));
  const [lists, setLists] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [userId, setUserId] = useState(null);
  
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [taskModal, setTaskModal] = useState(false);
  const [listModal, setListModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  // New Task State
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
      WebApp.expand(); try{WebApp.disableVerticalSwipes()}catch(e){} WebApp.enableClosingConfirmation();
      WebApp.setHeaderColor('#F2F2F7'); WebApp.setBackgroundColor('#F2F2F7');
    } else { setUserId(777); }
    return () => { window.removeEventListener('online', handleStatus); window.removeEventListener('offline', handleStatus); };
  }, []);

  useEffect(() => { localStorage.setItem('tasks', JSON.stringify(tasks)); }, [tasks]);

  useEffect(() => {
    if (!userId || !isOnline) return;
    const fetchData = async () => {
      const { data: tData } = await supabase.from('tasks').select('*').eq('telegram_user_id', userId).order('position');
      if (tData) {
         const localTemp = tasks.filter(t => t.id.toString().startsWith('temp-'));
         const merged = new Map();
         tData.forEach(t => merged.set(t.id, t));
         localTemp.forEach(t => merged.set(t.id, t));
         setTasks(Array.from(merged.values()).sort((a,b) => a.position - b.position));
      }
      const { data: lData } = await supabase.from('lists').select('*').eq('telegram_user_id', userId);
      if (lData) setLists(lData);
    };
    fetchData();
    const i = setInterval(fetchData, 30000); return () => clearInterval(i);
  }, [userId, isOnline]);

  const actions = {
    saveTask: async () => {
      if (!newT.title) return alert('Название?');
      let finalDate = null;
      if (hasDate) { finalDate = dateVal + (hasTime ? 'T' + timeVal : 'T09:00'); }
      
      if (editingId) {
          setTasks(prev => prev.map(t => t.id === editingId ? { ...t, ...newT, next_run: finalDate } : t));
          if (isOnline && !editingId.toString().startsWith('temp-')) {
              const { id, ...updates } = { ...newT, next_run: finalDate };
              await supabase.from('tasks').update(updates).eq('id', editingId);
          }
      } else {
          const tempId = 'temp-' + Date.now();
          const currentListId = (view !== 'home' && view !== 'today' && view !== 'all' && view !== 'upcoming' && view !== 'flagged') ? view : null;
          const task = { ...newT, next_run: finalDate, telegram_user_id: userId, status: 'active', completed: false, is_deleted: false, position: tasks.length, id: tempId, list_id: currentListId };
          setTasks(prev => [...prev, task]);
          if (isOnline) {
            const { id, ...dbTask } = task;
            const { data } = await supabase.from('tasks').insert([dbTask]).select();
            if (data) setTasks(prev => prev.map(t => t.id === tempId ? data[0] : t));
          }
      }
      closeModal();
    },
    createList: async () => {
      if (!newListTitle) return;
      const newList = { title: newListTitle, telegram_user_id: userId, color: '#3B82F6' };
      const { data } = await supabase.from('lists').insert([newList]).select();
      if (data) setLists(prev => [...prev, data[0]]);
      setListModal(false); setNewListTitle('');
    },
    complete: async (task) => {
      const isRecurring = task.frequency !== 'once' && task.next_run;
      const updater = t => t.id === task.id ? (isRecurring ? { ...t, next_run: calculateNextRun(t.next_run, t.frequency) } : { ...t, completed: true }) : t;
      setTasks(prev => prev.map(updater));
      if (isOnline && !task.id.toString().startsWith('temp-')) {
        const payload = isRecurring ? { next_run: calculateNextRun(task.next_run, task.frequency) } : { completed: true };
        await supabase.from('tasks').update(payload).eq('id', task.id);
      }
    },
    uncomplete: async (task) => {
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: false } : t));
        if (isOnline && !task.id.toString().startsWith('temp-')) await supabase.from('tasks').update({ completed: false }).eq('id', task.id);
    },
    restore: async (id) => {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, is_deleted: false } : t));
      if (isOnline) await supabase.from('tasks').update({ is_deleted: false }).eq('id', id);
    },
    delete: async (id) => {
        if (view === 'trash') {
           if (!confirm('Удалить навсегда?')) return;
           setTasks(prev => prev.filter(t => t.id !== id));
           if (isOnline) await supabase.from('tasks').delete().eq('id', id);
        } else {
           setTasks(prev => prev.map(t => t.id === id ? { ...t, is_deleted: true } : t));
           if (isOnline) await supabase.from('tasks').update({ is_deleted: true }).eq('id', id);
        }
    },
    reorder: (e) => {
      const { active, over } = e;
      if (active.id !== over.id) {
        setTasks(items => {
          const newOrder = arrayMove(items, items.findIndex(t => t.id === active.id), items.findIndex(t => t.id === over.id));
          if (isOnline) {
             const updates = newOrder.map((t, i) => ({ id: t.id, position: i, title: t.title, telegram_user_id: userId })).filter(t => !t.id.toString().startsWith('temp-'));
             supabase.from('tasks').upsert(updates).then();
          }
          return newOrder;
        });
      }
    },
    toggleSelect: (id) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
        setSelectedIds(newSet);
    },
    bulkDelete: async () => {
        if (selectedIds.size === 0 || !confirm(`Удалить выбранные?`)) return;
        const ids = Array.from(selectedIds);
        if (view === 'trash') {
            setTasks(prev => prev.filter(t => !selectedIds.has(t.id)));
            if (isOnline) await supabase.from('tasks').delete().in('id', ids);
        } else {
            setTasks(prev => prev.map(t => selectedIds.has(t.id) ? { ...t, is_deleted: true } : t));
            if (isOnline) await supabase.from('tasks').update({ is_deleted: true }).in('id', ids);
        }
        setSelectionMode(false); setSelectedIds(new Set());
    },
    bulkRestore: async () => {
        const ids = Array.from(selectedIds);
        setTasks(prev => prev.map(t => selectedIds.has(t.id) ? { ...t, is_deleted: false } : t));
        if (isOnline) await supabase.from('tasks').update({ is_deleted: false }).in('id', ids);
        setSelectionMode(false); setSelectedIds(new Set());
    },
    clearAll: async () => {
        if (!confirm('Очистить?')) return;
        const ids = filteredTasks.map(t => t.id);
        if (view === 'trash') {
             setTasks(prev => prev.filter(t => !ids.includes(t.id)));
             if (isOnline) await supabase.from('tasks').delete().in('id', ids);
        } else {
             setTasks(prev => prev.map(t => ids.includes(t.id) ? { ...t, is_deleted: true } : t));
             if (isOnline) await supabase.from('tasks').update({ is_deleted: true }).in('id', ids);
        }
    }
  };

  const openEditModal = (task) => {
      setEditingId(task.id);
      setNewT({ 
          title: task.title, description: task.description, type: task.type || 'reminder', 
          frequency: task.frequency || 'once', priority: task.priority || 0, is_flagged: task.is_flagged || false 
      });
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
  };

  const filteredTasks = useMemo(() => {
    let res = tasks;
    if (search) {
        const lower = search.toLowerCase();
        res = res.filter(t => t.title.toLowerCase().includes(lower) || (t.next_run && formatTime(t.next_run).toLowerCase().includes(lower)));
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

  return (
    <div className="min-h-[100dvh] w-full bg-[#F2F2F7] text-black font-sans flex flex-col overflow-hidden">
      {view === 'home' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-6 animate-in slide-in-from-left-4 duration-300">
          <div className="relative bg-[#E3E3E8] rounded-xl flex items-center px-3 py-2">
            <Search className="text-gray-400" size={18} />
            <input className="w-full bg-transparent pl-2 text-black placeholder-gray-500 outline-none" placeholder="Поиск (задача, дата)" value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch('')}><X size={16} className="text-gray-400"/></button>}
          </div>

          {!search && (
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
                   {lists.map((l, i) => (
                     <div key={l.id} className={i !== lists.length - 1 ? 'border-b border-gray-100' : ''}>
                        <UserListItem list={l} count={tasks.filter(t => t.list_id === l.id && !t.is_deleted && !t.completed).length} onClick={() => setView(l.id)} />
                     </div>
                   ))}
                   <div className={lists.length > 0 ? 'border-t border-gray-100' : ''}>
                        <div onClick={() => setView('completed')} className="group bg-white p-3 flex items-center gap-3 active:bg-gray-50 transition-colors cursor-pointer">
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><CheckCircle2 size={16} className="text-gray-500" /></div>
                            <span className="flex-1 text-[17px] font-medium text-black">Выполнено</span>
                            <ChevronRight size={16} className="text-gray-300" />
                        </div>
                        <div className="border-t border-gray-100"></div>
                        <div onClick={() => setView('trash')} className="group bg-white p-3 flex items-center gap-3 active:bg-gray-50 transition-colors cursor-pointer">
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><Trash2 size={16} className="text-gray-500" /></div>
                            <span className="flex-1 text-[17px] font-medium text-black">Недавно удаленные</span>
                            <ChevronRight size={16} className="text-gray-300" />
                        </div>
                   </div>
                 </div>
              </div>
              <div className="flex justify-end">
                 <button onClick={() => setListModal(true)} className="text-blue-600 font-medium text-lg p-2">Добавить список</button>
              </div>
            </>
          )}
          
          {search && <div className="space-y-2">{filteredTasks.map(t => <TaskItem key={t.id} task={t} actions={actions} viewMode="search" onEdit={openEditModal}/>)}</div>}
        </div>
      )}

      {view !== 'home' && (
        <div className="flex-1 flex flex-col h-full animate-in slide-in-from-right-8 duration-300 relative">
          <div className="px-4 pt-2 pb-2 bg-[#F2F2F7] sticky top-0 z-20 flex items-center justify-between">
             <div className="flex items-center gap-2">
                 <button onClick={() => { setView('home'); setSelectionMode(false); }} className="flex items-center text-blue-600 font-medium text-[17px] -ml-2"><ChevronLeft size={24} /> Списки</button>
             </div>
             {filteredTasks.length > 0 && (
                 <button onClick={() => { setSelectionMode(!selectionMode); setSelectedIds(new Set()); }} className="text-blue-600 font-medium text-[17px]">{selectionMode ? 'Готово' : 'Выбрать'}</button>
             )}
          </div>

          <div className="px-4 pb-4 flex justify-between items-end">
             <h1 className="text-3xl font-bold text-blue-600">
               {view === 'today' ? 'Сегодня' : view === 'upcoming' ? 'Запланировано' : view === 'all' ? 'Все' : view === 'flagged' ? 'С флажком' : view === 'trash' ? 'Корзина' : view === 'completed' ? 'Выполнено' : lists.find(l => l.id === view)?.title || 'Список'}
             </h1>
             {(view === 'trash' || view === 'completed') && filteredTasks.length > 0 && !selectionMode && (
                 <button onClick={actions.clearAll} className="text-red-500 text-sm font-medium bg-white/50 px-3 py-1 rounded-lg shadow-sm">Очистить</button>
             )}
          </div>

          <div className="flex-1 px-4 pb-36 overflow-y-auto space-y-3">
             {view === 'upcoming' && !selectionMode ? (
                 <ScheduledView tasks={filteredTasks} actions={actions} onEdit={openEditModal} />
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

          {!selectionMode && view !== 'trash' && view !== 'completed' && (
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F2F2F7] z-30">
              <button onClick={() => setTaskModal(true)} className="w-full bg-blue-600 text-white font-bold text-lg py-3.5 rounded-xl shadow-lg active:scale-[0.98] flex items-center justify-center gap-2"><Plus size={24} strokeWidth={3} /> Новое напоминание</button>
            </div>
          )}
          {selectionMode && (
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F2F2F7] border-t border-gray-200 z-30 flex justify-between items-center">
                <div className="text-gray-500 font-medium">Выбрано: {selectedIds.size}</div>
                <div className="flex gap-4">
                    {view === 'trash' ? <button onClick={actions.bulkRestore} disabled={selectedIds.size === 0} className="text-blue-600 font-bold disabled:text-gray-400">Восстановить</button> : <div/>}
                    <button onClick={actions.bulkDelete} disabled={selectedIds.size === 0} className="text-red-500 font-bold disabled:text-gray-300">Удалить</button>
                </div>
            </div>
          )}
        </div>
      )}

      {taskModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
           <div className="bg-[#F2F2F7] w-full sm:max-w-md rounded-t-2xl h-[90vh] flex flex-col shadow-2xl animate-slide-up">
              <div className="flex justify-between items-center px-4 py-4 bg-[#F2F2F7] rounded-t-2xl border-b border-gray-200/50">
                 <button onClick={closeModal} className="text-blue-600 text-[17px]">Отмена</button>
                 <span className="font-bold text-black text-[17px]">{editingId ? 'Правка' : 'Новое'}</span>
                 <button onClick={actions.saveTask} className={`text-[17px] font-bold ${newT.title ? 'text-blue-600' : 'text-gray-400'}`}>{editingId ? 'Готово' : 'Добавить'}</button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                 <div className="bg-white rounded-xl overflow-hidden shadow-sm">
                    <input className="w-full p-4 text-[17px] border-b border-gray-100 focus:outline-none placeholder-gray-400 text-black" placeholder="Название" value={newT.title} onChange={e => setNewT({...newT, title: e.target.value})} autoFocus />
                    <textarea className="w-full p-4 text-[15px] focus:outline-none resize-none h-24 placeholder-gray-400 text-black" placeholder="Заметки" value={newT.description} onChange={e => setNewT({...newT, description: e.target.value})} />
                 </div>
                 <div className="bg-white rounded-xl overflow-hidden shadow-sm space-y-[1px] bg-gray-100">
                    <div className="bg-white p-3.5 flex justify-between items-center">
                        <div className="flex items-center gap-3"><div className="w-8 h-8 rounded bg-red-500 flex items-center justify-center text-white"><CalendarIcon size={18} fill="white" /></div><span className="text-[17px] text-black">Дата</span></div>
                        <IOSSwitch checked={hasDate} onChange={setHasDate} />
                    </div>
                    {hasDate && <div className="bg-white px-4 pb-3 animate-in fade-in"><input type="date" value={dateVal} onChange={e => setDateVal(e.target.value)} className="w-full p-2 bg-gray-100 rounded text-blue-600 font-semibold outline-none text-right" /></div>}
                    <div className="bg-white p-3.5 flex justify-between items-center">
                        <div className="flex items-center gap-3"><div className="w-8 h-8 rounded bg-blue-500 flex items-center justify-center text-white"><Clock size={18} fill="white" /></div><span className="text-[17px] text-black">Время</span></div>
                        <IOSSwitch checked={hasTime} onChange={(val) => { setHasTime(val); if(val && !hasDate) setHasDate(true); }} />
                    </div>
                    {hasTime && <div className="bg-white px-4 pb-3 animate-in fade-in"><input type="time" value={timeVal} onChange={e => setTimeVal(e.target.value)} className="w-full p-2 bg-gray-100 rounded text-blue-600 font-semibold outline-none text-right" /></div>}
                 </div>
                 <div className="bg-white rounded-xl overflow-hidden shadow-sm space-y-[1px] bg-gray-100">
                    <div className="bg-white p-3.5 flex justify-between items-center">
                        <div className="flex items-center gap-3"><div className="w-8 h-8 rounded bg-orange-500 flex items-center justify-center text-white"><Flag size={18} fill="white" /></div><span className="text-[17px] text-black">Флаг</span></div>
                        <IOSSwitch checked={newT.is_flagged} onChange={v => setNewT({...newT, is_flagged: v})} />
                    </div>
                    <div className="bg-white p-3.5 flex justify-between items-center">
                       <span className="text-[17px] text-black">Приоритет</span>
                       <div className="flex items-center gap-1">
                          <select className="appearance-none bg-transparent text-gray-500 text-[17px] text-right outline-none pr-6 z-10 relative" value={newT.priority} onChange={e => setNewT({...newT, priority: parseInt(e.target.value)})}>
                             <option value="0">Нет</option><option value="1">Низкий</option><option value="2">Средний</option><option value="3">Высокий</option>
                          </select>
                          <span className="absolute right-9 text-gray-500">{newT.priority === 3 ? '!!!' : newT.priority === 2 ? '!!' : newT.priority === 1 ? '!' : 'Нет'}</span>
                          <ChevronRight size={16} className="text-gray-400 absolute right-3" />
                       </div>
                    </div>
                    <div className="bg-white p-3.5 flex justify-between items-center">
                        <span className="text-[17px] text-black">Действие</span>
                        <div className="flex items-center gap-1 relative">
                             <select className="appearance-none bg-transparent text-gray-500 text-[17px] text-right outline-none pr-6 z-10 relative" value={newT.type} onChange={e => setNewT({...newT, type: e.target.value})}>
                                <option value="reminder">Нет</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="web_search">Поиск</option>
                             </select>
                             <ChevronRight size={16} className="text-gray-400 absolute right-0" />
                        </div>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}
      {listModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-xs rounded-2xl p-4 shadow-2xl animate-in zoom-in-95">
              <h3 className="text-lg font-bold text-center mb-4">Новый список</h3>
              <div className="bg-gray-100 rounded-xl p-4 mb-4 flex justify-center"><div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center shadow-lg"><List size={32} className="text-white" /></div></div>
              <input className="w-full bg-gray-100 rounded-lg p-3 text-center text-[17px] font-bold outline-none focus:ring-2 focus:ring-blue-500 mb-4" placeholder="Название списка" value={newListTitle} onChange={e => setNewListTitle(e.target.value)} autoFocus />
              <div className="flex gap-2">
                  <button onClick={() => setListModal(false)} className="flex-1 py-3 text-gray-500 font-medium hover:bg-gray-50 rounded-lg">Отмена</button>
                  <button onClick={actions.createList} disabled={!newListTitle} className="flex-1 py-3 text-blue-600 font-bold hover:bg-blue-50 rounded-lg disabled:opacity-50">Готово</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;