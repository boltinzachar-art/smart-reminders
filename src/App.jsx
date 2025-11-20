import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from './supabaseClient';
import WebApp from '@twa-dev/sdk';
import { 
  Plus, Search, ExternalLink, RefreshCw, RotateCcw, Trash2, GripVertical, 
  CloudOff, ChevronRight, ChevronLeft, Calendar as CalendarIcon, Clock, MapPin, 
  Flag, Camera, CheckCircle2, List, LayoutGrid, CalendarClock, Inbox, AlertCircle
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
  const isToday = d.toDateString() === new Date().toDateString();
  return isToday ? d.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'}) : d.toLocaleDateString('ru-RU', {day:'numeric', month:'short'}) + ' ' + d.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'});
};

// --- COMPONENTS ---
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

const UserListItem = ({ list, count, onClick, onDelete }) => (
  <div onClick={onClick} className="group bg-white p-3 rounded-xl flex items-center gap-3 active:bg-gray-50 transition-colors cursor-pointer">
    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
      <List size={16} className="text-blue-600" />
    </div>
    <span className="flex-1 text-[17px] font-medium text-black">{list.title}</span>
    <span className="text-gray-400 text-[15px]">{count || 0}</span>
    <ChevronRight size={16} className="text-gray-300" />
  </div>
);

const TaskItem = ({ task, actions, viewMode }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const [isCompleting, setIsCompleting] = useState(false);
  const timerRef = useRef(null);

  const handleCircleClick = (e) => {
    e.stopPropagation();
    if (viewMode === 'completed') { actions.uncomplete(task); return; }
    if (viewMode === 'trash') return;
    if (isCompleting) { clearTimeout(timerRef.current); setIsCompleting(false); } 
    else { setIsCompleting(true); timerRef.current = setTimeout(() => { actions.complete(task); setIsCompleting(false); }, 1500); }
  };

  const style = { transform: CSS.Transform.toString(transform), transition: isDragging ? 'none' : 'all 0.3s ease', zIndex: isDragging ? 50 : 'auto', opacity: isDragging ? 0.8 : 1 };
  const isOverdue = task.next_run && new Date(task.next_run) < new Date() && !task.completed;
  const isTrash = viewMode === 'trash';
  
  let circleClass = "mt-0.5 shrink-0 w-[24px] h-[24px] rounded-full border-2 flex items-center justify-center transition-all duration-300 ";
  if (isCompleting) circleClass += "animate-blink-3 border-gray-300"; 
  else if (task.completed) circleClass += "bg-blue-500 border-blue-500";
  else circleClass += "border-gray-300 hover:border-blue-500 bg-transparent";

  return (
    <div ref={setNodeRef} style={style} className={`group w-full bg-white rounded-xl p-3 shadow-sm flex items-start gap-3 transition-all ${isCompleting ? 'bg-gray-50' : ''} ${isDragging ? 'shadow-xl ring-2 ring-blue-500/20' : ''}`}>
      {!isTrash && viewMode !== 'completed' && (
        <div {...attributes} {...listeners} style={{ touchAction: 'none' }} className="mt-1 p-2 -ml-2 text-gray-300 cursor-grab active:cursor-grabbing touch-none"><GripVertical size={20} /></div>
      )}
      {!isTrash ? (
        <button onPointerDown={e => e.stopPropagation()} onClick={handleCircleClick} className={circleClass}>
          {(task.completed || isCompleting) && viewMode !== 'completed' && <div className={`w-2.5 h-2.5 bg-white rounded-full ${isCompleting ? '' : 'animate-in zoom-in'}`} />}
          {viewMode === 'completed' && <CheckCircle2 size={16} className="text-white" />}
        </button>
      ) : (
        <button onClick={() => actions.restore(task.id)} className="mt-0.5 text-blue-600 p-1"><RotateCcw size={20} /></button>
      )}
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-2">
           <div className={`text-[17px] leading-tight break-words transition-colors ${task.completed || isCompleting ? 'text-gray-400' : 'text-black'}`}>{task.title}</div>
           {task.priority === 5 && <Flag size={14} className="text-orange-500 fill-orange-500" />}
        </div>
        {task.description && <p className="text-gray-400 font-semibold text-[13px] mt-1 line-clamp-2 leading-snug break-words">{task.description}</p>}
        <div className="flex items-center flex-wrap gap-2 mt-1.5">
          {task.next_run && <span className={`text-xs font-semibold ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>{formatTime(task.next_run)}</span>}
          {task.frequency !== 'once' && <span className="text-gray-400 flex items-center text-xs gap-0.5 font-medium"><RefreshCw size={10} /> {task.frequency}</span>}
        </div>
      </div>
      {isTrash && <button onClick={() => actions.delete(task.id)} className="shrink-0 text-red-500 p-1"><Trash2 size={18} /></button>}
    </div>
  );
};

// --- APP ---
const App = () => {
  const [view, setView] = useState('home'); // 'home', 'today', 'all', 'flagged', 'scheduled', 'completed', 'trash', or list_UUID
  const [tasks, setTasks] = useState(() => JSON.parse(localStorage.getItem('tasks') || '[]'));
  const [lists, setLists] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [userId, setUserId] = useState(null);
  
  // Modal States
  const [taskModal, setTaskModal] = useState(false);
  const [listModal, setListModal] = useState(false);
  
  // New Task Data
  const [newT, setNewT] = useState({ title: '', description: '', type: 'reminder', frequency: 'once', priority: 3 });
  const [hasDate, setHasDate] = useState(false);
  const [hasTime, setHasTime] = useState(false);
  const [dateVal, setDateVal] = useState(new Date().toISOString().slice(0, 10));
  const [timeVal, setTimeVal] = useState(new Date().toTimeString().slice(0, 5));

  // New List Data
  const [newListTitle, setNewListTitle] = useState('');

  const sensors = useSensors(useSensor(PointerSensor), useSensor(TouchSensor, { activationConstraint: { tolerance: 5 } }));

  // Init
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

  // Data Sync
  useEffect(() => { localStorage.setItem('tasks', JSON.stringify(tasks)); }, [tasks]);

  useEffect(() => {
    if (!userId || !isOnline) return;
    const fetchData = async () => {
      // 1. Get Tasks
      const { data: tData } = await supabase.from('tasks').select('*').eq('telegram_user_id', userId).order('position');
      if (tData) {
         const localTemp = tasks.filter(t => t.id.toString().startsWith('temp-'));
         const merged = new Map();
         tData.forEach(t => merged.set(t.id, t));
         localTemp.forEach(t => merged.set(t.id, t));
         setTasks(Array.from(merged.values()).sort((a,b) => a.position - b.position));
      }
      // 2. Get Lists
      const { data: lData } = await supabase.from('lists').select('*').eq('telegram_user_id', userId);
      if (lData) setLists(lData);
    };
    fetchData();
    const i = setInterval(fetchData, 30000); return () => clearInterval(i);
  }, [userId, isOnline]);

  // Actions
  const actions = {
    createTask: async () => {
      if (!newT.title) return alert('Название?');
      const tempId = 'temp-' + Date.now();
      let finalDate = null;
      if (hasDate) { finalDate = dateVal + (hasTime ? 'T' + timeVal : 'T09:00'); }
      
      // Если мы в кастомном списке, добавляем list_id
      const currentListId = (view !== 'home' && view !== 'today' && view !== 'all' && view !== 'upcoming' && view !== 'flagged') ? view : null;

      const task = { ...newT, next_run: finalDate, telegram_user_id: userId, status: 'active', completed: false, is_deleted: false, position: tasks.length, id: tempId, list_id: currentListId };
      
      setTasks(prev => [...prev, task]);
      setTaskModal(false);
      setNewT({ title: '', description: '', type: 'reminder', frequency: 'once', priority: 3 });
      setHasDate(false); setHasTime(false);

      if (isOnline) {
        const { id, ...dbTask } = task;
        const { data } = await supabase.from('tasks').insert([dbTask]).select();
        if (data) setTasks(prev => prev.map(t => t.id === tempId ? data[0] : t));
      }
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
    delete: async (id) => {
      if (view === 'trash') {
        setTasks(prev => prev.filter(t => t.id !== id));
        if (isOnline) await supabase.from('tasks').delete().eq('id', id);
      } else {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, is_deleted: true } : t));
        if (isOnline) await supabase.from('tasks').update({ is_deleted: true }).eq('id', id);
      }
    },
    restore: async (id) => {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, is_deleted: false } : t));
      if (isOnline) await supabase.from('tasks').update({ is_deleted: false }).eq('id', id);
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
    }
  };

  // Filter Logic
  const getFilteredTasks = () => {
    let res = tasks;
    if (view === 'trash') return res.filter(t => t.is_deleted);
    
    res = res.filter(t => !t.is_deleted); // Not deleted

    if (view === 'completed') return res.filter(t => t.completed);
    
    // For normal lists, hide completed
    res = res.filter(t => !t.completed);

    const today = new Date().setHours(0,0,0,0);
    const tomorrow = today + 86400000;

    if (view === 'today') return res.filter(t => t.next_run && new Date(t.next_run) >= today && new Date(t.next_run) < tomorrow);
    if (view === 'upcoming') return res.filter(t => t.next_run && new Date(t.next_run) >= tomorrow);
    if (view === 'flagged') return res.filter(t => t.priority === 5);
    if (view === 'all') return res;
    
    // Custom List
    return res.filter(t => t.list_id === view);
  };

  const filteredTasks = getFilteredTasks();
  
  // Counts for Smart Lists
  const counts = {
    today: tasks.filter(t => !t.is_deleted && !t.completed && t.next_run && new Date(t.next_run) >= new Date().setHours(0,0,0,0) && new Date(t.next_run) < new Date().setHours(0,0,0,0)+86400000).length,
    upcoming: tasks.filter(t => !t.is_deleted && !t.completed && t.next_run && new Date(t.next_run) >= new Date().setHours(0,0,0,0)+86400000).length,
    all: tasks.filter(t => !t.is_deleted && !t.completed).length,
    flagged: tasks.filter(t => !t.is_deleted && !t.completed && t.priority === 5).length,
  };

  // --- RENDER ---
  return (
    <div className="min-h-[100dvh] w-full bg-[#F2F2F7] text-black font-sans flex flex-col overflow-hidden">
      
      {/* HOME SCREEN */}
      {view === 'home' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-6 animate-in slide-in-from-left-4 duration-300">
          {/* Search */}
          <div className="relative bg-[#E3E3E8] rounded-xl flex items-center px-3 py-2">
            <Search className="text-gray-400" size={18} />
            <input className="w-full bg-transparent pl-2 text-black placeholder-gray-500 outline-none" placeholder="Поиск" />
          </div>

          {/* Smart Lists Grid */}
          <div className="grid grid-cols-2 gap-3">
            <SmartListCard title="Сегодня" count={counts.today} icon={CalendarIcon} color="bg-blue-500" onClick={() => setView('today')} />
            <SmartListCard title="Запланировано" count={counts.upcoming} icon={CalendarClock} color="bg-red-500" onClick={() => setView('upcoming')} />
            <SmartListCard title="Все" count={counts.all} icon={Inbox} color="bg-gray-500" onClick={() => setView('all')} />
            <SmartListCard title="С флажком" count={counts.flagged} icon={Flag} color="bg-orange-500" onClick={() => setView('flagged')} />
          </div>

          {/* Custom Lists */}
          <div>
             <h2 className="text-xl font-bold text-black mb-2 ml-1">Мои списки</h2>
             <div className="bg-white rounded-xl overflow-hidden shadow-sm">
               {lists.map((l, i) => (
                 <div key={l.id} className={i !== lists.length - 1 ? 'border-b border-gray-100' : ''}>
                    <UserListItem 
                      list={l} 
                      count={tasks.filter(t => t.list_id === l.id && !t.is_deleted && !t.completed).length} 
                      onClick={() => setView(l.id)} 
                    />
                 </div>
               ))}
               {/* Completed & Trash links inside lists block or separate? Apple puts lists here. */}
             </div>
          </div>
          
          {/* System Lists (Completed / Trash) */}
          <div className="space-y-2">
             <button onClick={() => setView('completed')} className="w-full bg-white p-3 rounded-xl flex items-center justify-between text-gray-600 active:scale-98 transition">
               <div className="flex items-center gap-2"><CheckCircle2 size={18} /> Выполнено</div><ChevronRight size={16} className="text-gray-300"/>
             </button>
             <button onClick={() => setView('trash')} className="w-full bg-white p-3 rounded-xl flex items-center justify-between text-gray-600 active:scale-98 transition">
               <div className="flex items-center gap-2"><Trash2 size={18} /> Недавно удаленные</div><ChevronRight size={16} className="text-gray-300"/>
             </button>
          </div>

          {/* Add List Button */}
          <div className="flex justify-end">
             <button onClick={() => setListModal(true)} className="text-blue-600 font-medium text-lg p-2">Добавить список</button>
          </div>
        </div>
      )}

      {/* LIST DETAIL SCREEN */}
      {view !== 'home' && (
        <div className="flex-1 flex flex-col h-full animate-in slide-in-from-right-8 duration-300">
          {/* Header */}
          <div className="px-4 pt-2 pb-2 bg-[#F2F2F7] sticky top-0 z-20 flex items-center justify-between">
             <button onClick={() => setView('home')} className="flex items-center text-blue-600 font-medium text-[17px] -ml-2">
               <ChevronLeft size={24} /> Списки
             </button>
             <div className="flex gap-2">
                {/* Menu dots could go here */}
             </div>
          </div>

          {/* List Title */}
          <div className="px-4 pb-4">
             <h1 className="text-3xl font-bold text-blue-600">
               {view === 'today' ? 'Сегодня' : view === 'upcoming' ? 'Запланировано' : view === 'all' ? 'Все' : view === 'flagged' ? 'С флажком' : view === 'trash' ? 'Корзина' : view === 'completed' ? 'Выполнено' : lists.find(l => l.id === view)?.title || 'Список'}
             </h1>
          </div>

          {/* Tasks */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={actions.reorder}>
            <div className="flex-1 px-4 pb-36 space-y-3 overflow-y-auto">
              <SortableContext items={filteredTasks} strategy={verticalListSortingStrategy}>
                {filteredTasks.length === 0 ? <div className="text-center py-20 text-gray-400">Нет напоминаний</div> : filteredTasks.map(t => (
                  <TaskItem key={t.id} task={t} actions={actions} viewMode={view} />
                ))}
              </SortableContext>
            </div>
          </DndContext>

          {/* Add Button (Only for active lists) */}
          {view !== 'trash' && view !== 'completed' && (
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F2F2F7] z-30">
              <button onClick={() => setTaskModal(true)} className="w-full bg-blue-600 text-white font-bold text-lg py-3.5 rounded-xl shadow-lg active:scale-[0.98] flex items-center justify-center gap-2">
                 <Plus size={24} strokeWidth={3} /> Новое напоминание
              </button>
            </div>
          )}
        </div>
      )}

      {/* --- MODALS --- */}
      
      {/* NEW TASK MODAL */}
      {taskModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
           <div className="bg-[#F2F2F7] w-full sm:max-w-md rounded-t-2xl h-[90vh] flex flex-col shadow-2xl animate-slide-up">
              <div className="flex justify-between items-center px-4 py-4 bg-[#F2F2F7] rounded-t-2xl border-b border-gray-200/50">
                 <button onClick={() => setTaskModal(false)} className="text-blue-600 text-[17px]">Отмена</button>
                 <span className="font-bold text-black text-[17px]">Новое</span>
                 <button onClick={actions.createTask} className={`text-[17px] font-bold ${newT.title ? 'text-blue-600' : 'text-gray-400'}`}>Добавить</button>
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
                       <span className="text-[17px] text-black">Приоритет</span>
                       <div className="flex items-center gap-1">
                          <select className="appearance-none bg-transparent text-gray-500 text-[17px] text-right outline-none pr-6 z-10 relative" value={newT.priority} onChange={e => setNewT({...newT, priority: parseInt(e.target.value)})}>
                             <option value="1">Низкий</option><option value="3">Нет</option><option value="5">Высокий</option>
                          </select>
                          <span className="absolute right-9 text-gray-500">{newT.priority === 5 ? '!!!' : newT.priority === 1 ? '!' : 'Нет'}</span>
                          <ChevronRight size={16} className="text-gray-400 absolute right-3" />
                       </div>
                    </div>
                 </div>
              </div>
              <div className="flex justify-between items-center px-6 py-4 bg-[#F2F2F7] pb-8">
                  <button onClick={() => setHasDate(!hasDate)} className="text-blue-600 active:opacity-50 transition-opacity"><CalendarIcon size={28} /></button>
                  <button className="text-blue-600 active:opacity-50 transition-opacity"><MapPin size={28} /></button>
                  <button onClick={() => setNewT({...newT, priority: newT.priority === 5 ? 3 : 5})} className={`transition-colors ${newT.priority === 5 ? 'text-orange-500 fill-orange-500' : 'text-blue-600'}`}><Flag size={28} /></button>
                  <button className="text-blue-600 active:opacity-50 transition-opacity"><Camera size={28} /></button>
              </div>
           </div>
        </div>
      )}

      {/* NEW LIST MODAL */}
      {listModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-xs rounded-2xl p-4 shadow-2xl animate-in zoom-in-95">
              <h3 className="text-lg font-bold text-center mb-4">Новый список</h3>
              <div className="bg-gray-100 rounded-xl p-4 mb-4 flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center shadow-lg">
                      <List size={32} className="text-white" />
                  </div>
              </div>
              <input 
                 className="w-full bg-gray-100 rounded-lg p-3 text-center text-[17px] font-bold outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                 placeholder="Название списка"
                 value={newListTitle}
                 onChange={e => setNewListTitle(e.target.value)}
                 autoFocus
              />
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