import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import WebApp from '@twa-dev/sdk';
import { 
  Plus, Search, ExternalLink, RefreshCw, RotateCcw, Trash2, GripVertical, 
  CloudOff, ChevronRight, Calendar as CalendarIcon, Clock, MapPin, Hash, 
  Flag, Camera, X, List 
} from 'lucide-react';
import { DndContext, closestCenter, useSensor, useSensors, TouchSensor, PointerSensor } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- IOS SWITCH ---
const IOSSwitch = ({ checked, onChange }) => (
  <button 
    onClick={() => onChange(!checked)}
    className={`w-[51px] h-[31px] rounded-full p-0.5 transition-colors duration-300 focus:outline-none ${checked ? 'bg-[#34C759]' : 'bg-[#E9E9EA]'}`}
  >
    <div className={`w-[27px] h-[27px] bg-white rounded-full shadow-sm transition-transform duration-300 ${checked ? 'translate-x-[20px]' : 'translate-x-0'}`} />
  </button>
);

// --- LOGIC ---
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
  return isToday 
    ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) 
    : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
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

// --- CARD COMPONENT ---
const TaskItem = ({ task, actions, isTrash }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const [flashing, setFlashing] = useState(false);

  const onComplete = (e) => {
    e.stopPropagation();
    setFlashing(true);
    setTimeout(() => { actions.complete(task); setTimeout(() => setFlashing(false), 100); }, 600);
  };

  const style = { transform: CSS.Transform.toString(transform), transition: isDragging ? 'none' : 'all 0.3s ease', zIndex: isDragging ? 50 : 'auto', opacity: isDragging ? 0.8 : 1 };
  const isOverdue = task.next_run && new Date(task.next_run) < new Date() && !task.completed;

  return (
    <div ref={setNodeRef} style={style} className={`group w-full bg-white rounded-xl p-3 shadow-sm flex items-start gap-3 transition-all ${flashing ? 'bg-gray-50' : ''} ${isDragging ? 'shadow-xl ring-2 ring-blue-500/20' : ''}`}>
      {!isTrash && (
        <div {...attributes} {...listeners} style={{ touchAction: 'none' }} className="mt-1 p-2 -ml-2 text-gray-300 cursor-grab active:cursor-grabbing touch-none">
            <GripVertical size={20} />
        </div>
      )}
      {!isTrash ? (
        <button onPointerDown={e => e.stopPropagation()} onClick={onComplete} className={`mt-0.5 shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${flashing || task.completed ? 'bg-blue-500 border-blue-500' : 'border-gray-300 hover:border-blue-500'}`}>
          {(flashing || task.completed) && <div className="w-2.5 h-2.5 bg-white rounded-full animate-in zoom-in" />}
        </button>
      ) : (
        <button onClick={() => actions.restore(task.id)} className="mt-0.5 text-blue-600 p-1"><RotateCcw size={20} /></button>
      )}
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-2">
             <div className={`text-[17px] leading-tight break-words transition-colors ${task.completed || flashing ? 'text-gray-400 line-through' : 'text-black'}`}>{task.title}</div>
             {task.priority === 5 && <Flag size={14} className="text-orange-500 fill-orange-500" />}
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
      {isTrash && <button onClick={() => actions.delete(task.id)} className="shrink-0 text-red-500 p-1"><Trash2 size={18} /></button>}
    </div>
  );
};

// --- MAIN APP ---
const App = () => {
  const [tasks, setTasks] = useState(() => JSON.parse(localStorage.getItem('tasks') || '[]'));
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [userId, setUserId] = useState(null);
  const [modal, setModal] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  
  // NEW TASK STATE
  const [newT, setNewT] = useState({ title: '', description: '', type: 'reminder', frequency: 'once', priority: 3 });
  const [hasDate, setHasDate] = useState(false);
  const [hasTime, setHasTime] = useState(false);
  const [dateVal, setDateVal] = useState(new Date().toISOString().slice(0, 10));
  const [timeVal, setTimeVal] = useState(new Date().toTimeString().slice(0, 5));

  const sensors = useSensors(useSensor(PointerSensor), useSensor(TouchSensor, { activationConstraint: { tolerance: 5 } }));

  useEffect(() => {
    const handleStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleStatus); window.addEventListener('offline', handleStatus);
    if (WebApp.initDataUnsafe.user) {
      setUserId(WebApp.initDataUnsafe.user.id);
      WebApp.expand(); try { WebApp.disableVerticalSwipes(); } catch (e) {} WebApp.enableClosingConfirmation(); 
      WebApp.setHeaderColor('#F2F2F7'); WebApp.setBackgroundColor('#F2F2F7');
    } else { setUserId(777); }
    return () => { window.removeEventListener('online', handleStatus); window.removeEventListener('offline', handleStatus); };
  }, []);

  useEffect(() => { localStorage.setItem('tasks', JSON.stringify(tasks)); }, [tasks]);
  
  useEffect(() => {
    if (!userId || !isOnline) return;
    const sync = async () => {
      const { data } = await supabase.from('tasks').select('*').eq('telegram_user_id', userId).order('position');
      if (data) {
        const merged = new Map();
        data.forEach(t => merged.set(t.id, t));
        tasks.filter(t => t.id.toString().startsWith('temp-')).forEach(t => merged.set(t.id, t));
        setTasks(Array.from(merged.values()).sort((a,b) => a.position - b.position));
      }
    };
    sync(); const i = setInterval(sync, 30000); return () => clearInterval(i);
  }, [userId, isOnline]);

  const actions = {
    create: async () => {
      if (!newT.title) return alert('Введите название');
      const tempId = 'temp-' + Date.now();
      
      let finalDate = null;
      if (hasDate) {
          finalDate = dateVal;
          if (hasTime) finalDate += 'T' + timeVal;
          else finalDate += 'T09:00';
      }

      const task = { ...newT, next_run: finalDate, telegram_user_id: userId, status: 'active', completed: false, is_deleted: false, position: tasks.length, id: tempId };
      
      setTasks(prev => [...prev, task]);
      setModal(false);
      setNewT({ title: '', description: '', type: 'reminder', frequency: 'once', priority: 3 });
      setHasDate(false); setHasTime(false);

      if (isOnline) {
        const { id, ...dbTask } = task;
        const { data } = await supabase.from('tasks').insert([dbTask]).select();
        if (data) setTasks(prev => prev.map(t => t.id === tempId ? data[0] : t));
      }
    },
    complete: async (task) => {
      const isRecurring = task.frequency !== 'once' && task.next_run;
      const updater = t => t.id === task.id ? (isRecurring ? { ...t, next_run: calculateNextRun(t.next_run, t.frequency) } : { ...t, completed: true }) : t;
      setTasks(prev => prev.map(updater));
      if (!isRecurring) setTimeout(() => setTasks(prev => prev.filter(t => t.id !== task.id)), 300);
      if (isOnline && !task.id.toString().startsWith('temp-')) {
        const payload = isRecurring ? { next_run: calculateNextRun(task.next_run, task.frequency) } : { completed: true };
        await supabase.from('tasks').update(payload).eq('id', task.id);
      }
    },
    delete: async (id) => {
      if (filter === 'trash') {
        if (confirm('Удалить?')) {
          setTasks(prev => prev.filter(t => t.id !== id));
          if (isOnline) await supabase.from('tasks').delete().eq('id', id);
        }
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

  const filteredTasks = useMemo(() => {
    let res = tasks.filter(t => t.title.toLowerCase().includes(search.toLowerCase()));
    if (filter === 'trash') return res.filter(t => t.is_deleted);
    res = res.filter(t => !t.is_deleted);
    const today = new Date().setHours(0,0,0,0);
    const tomorrow = today + 86400000;
    if (filter === 'today') res = res.filter(t => !t.completed && t.next_run && new Date(t.next_run) >= today && new Date(t.next_run) < tomorrow);
    else if (filter === 'upcoming') res = res.filter(t => !t.completed && t.next_run && new Date(t.next_run) >= tomorrow);
    else if (filter === 'completed') res = res.filter(t => t.completed);
    else res = res.filter(t => !t.completed);
    return res;
  }, [tasks, filter, search]);

  return (
    <div className="min-h-[100dvh] w-full bg-[#F2F2F7] text-black font-sans flex flex-col">
      <div className="px-4 pt-2 pb-2 bg-[#F2F2F7] sticky top-0 z-20">
        <div className="flex justify-between items-center mb-3">
           <h1 className="text-3xl font-bold ml-1">{filter === 'trash' ? 'Корзина' : filter === 'completed' ? 'Готовые' : 'Напоминания'}</h1>
           <div className="flex gap-2">{!isOnline && <CloudOff className="text-gray-400" size={20} />}</div>
        </div>
        <div className="relative mb-3 bg-[#E3E3E8] rounded-xl flex items-center px-3">
          <Search className="text-gray-400" size={18} />
          <input className="w-full bg-transparent p-2 pl-2 text-black placeholder-gray-500 outline-none" placeholder="Поиск" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2 pb-1 overflow-x-auto hide-scrollbar">
           {[{id:'all',l:'Все'},{id:'today',l:'Сегодня'},{id:'upcoming',l:'Будущие'},{id:'completed',l:'Готовые'},{id:'trash',l:'Корзина'}].map(f => (
             <button key={f.id} onClick={() => setFilter(f.id)} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${filter === f.id ? 'bg-black text-white' : 'bg-white text-gray-600 shadow-sm'}`}>{f.l}</button>
           ))}
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={actions.reorder}>
        <div className="flex-1 px-4 pb-36 space-y-3">
          <SortableContext items={filteredTasks} strategy={verticalListSortingStrategy}>
            {filteredTasks.length === 0 ? <div className="text-center py-20 text-gray-400">Пусто</div> : filteredTasks.map(t => (
              <TaskItem key={t.id} task={t} actions={actions} isTrash={filter === 'trash'} />
            ))}
          </SortableContext>
        </div>
      </DndContext>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F2F2F7] z-30">
         <button onClick={() => setModal(true)} className="w-full bg-blue-600 text-white font-bold text-lg py-3.5 rounded-xl shadow-lg active:scale-[0.98] transition-transform flex items-center justify-center gap-2">
            <Plus size={24} strokeWidth={3} /> Новое напоминание
         </button>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
           <div className="bg-[#F2F2F7] w-full sm:max-w-md rounded-t-2xl h-[90vh] flex flex-col shadow-2xl animate-slide-up">
              
              <div className="flex justify-between items-center px-4 py-4 bg-[#F2F2F7] rounded-t-2xl border-b border-gray-200/50">
                 <button onClick={() => setModal(false)} className="text-blue-600 text-[17px]">Отмена</button>
                 <span className="font-bold text-black text-[17px]">Новое</span>
                 <button onClick={actions.create} className={`text-[17px] font-bold ${newT.title ? 'text-blue-600' : 'text-gray-400'}`}>Добавить</button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                 <div className="bg-white rounded-xl overflow-hidden shadow-sm">
                    <input className="w-full p-4 text-[17px] border-b border-gray-100 focus:outline-none placeholder-gray-400 text-black" placeholder="Название" value={newT.title} onChange={e => setNewT({...newT, title: e.target.value})} autoFocus />
                    <textarea className="w-full p-4 text-[15px] focus:outline-none resize-none h-24 placeholder-gray-400 text-black" placeholder="Заметки" value={newT.description} onChange={e => setNewT({...newT, description: e.target.value})} />
                 </div>

                 <div className="bg-white rounded-xl overflow-hidden shadow-sm space-y-[1px] bg-gray-100">
                    <div className="bg-white p-3.5 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-red-500 flex items-center justify-center text-white"><CalendarIcon size={18} fill="white" /></div>
                            <span className="text-[17px] text-black">Дата</span>
                        </div>
                        <IOSSwitch checked={hasDate} onChange={setHasDate} />
                    </div>
                    {hasDate && (
                        <div className="bg-white px-4 pb-3 animate-in fade-in slide-in-from-top-2">
                            <input type="date" value={dateVal} onChange={e => setDateVal(e.target.value)} className="w-full p-2 bg-gray-100 rounded text-blue-600 font-semibold outline-none text-right" />
                        </div>
                    )}

                    <div className="bg-white p-3.5 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-blue-500 flex items-center justify-center text-white"><Clock size={18} fill="white" /></div>
                            <span className="text-[17px] text-black">Время</span>
                        </div>
                        <IOSSwitch checked={hasTime} onChange={(val) => { setHasTime(val); if(val && !hasDate) setHasDate(true); }} />
                    </div>
                    {hasTime && (
                        <div className="bg-white px-4 pb-3 animate-in fade-in slide-in-from-top-2">
                            <input type="time" value={timeVal} onChange={e => setTimeVal(e.target.value)} className="w-full p-2 bg-gray-100 rounded text-blue-600 font-semibold outline-none text-right" />
                        </div>
                    )}
                 </div>

                 <div className="bg-white rounded-xl overflow-hidden shadow-sm space-y-[1px] bg-gray-100">
                    <div className="bg-white p-3.5 flex justify-between items-center">
                       <span className="text-[17px] text-black">Список</span>
                       <div className="flex items-center gap-2 text-gray-400">
                          <div className="w-3 h-3 rounded-full bg-blue-500"/> <span className="text-[17px] text-gray-500">Напоминания</span>
                          <ChevronRight size={16} />
                       </div>
                    </div>
                    
                    <div className="bg-white p-3.5 flex justify-between items-center">
                       <span className="text-[17px] text-black">Приоритет</span>
                       <div className="flex items-center gap-1">
                          <select className="appearance-none bg-transparent text-gray-500 text-[17px] text-right outline-none pr-6 z-10 relative" value={newT.priority} onChange={e => setNewT({...newT, priority: parseInt(e.target.value)})}>
                             <option value="1">Низкий</option>
                             <option value="3">Нет</option>
                             <option value="5">Высокий</option>
                          </select>
                          <span className="absolute right-9 text-gray-500">{newT.priority === 5 ? '!!!' : newT.priority === 1 ? '!' : 'Нет'}</span>
                          <ChevronRight size={16} className="text-gray-400 absolute right-3" />
                       </div>
                    </div>

                    <div className="bg-white p-3.5 flex justify-between items-center">
                        <span className="text-[17px] text-black">Действие</span>
                        <div className="flex items-center gap-1 relative">
                             <select className="appearance-none bg-transparent text-gray-500 text-[17px] text-right outline-none pr-6 z-10 relative" value={newT.type} onChange={e => setNewT({...newT, type: e.target.value})}>
                                <option value="reminder">Нет</option>
                                <option value="email">Email</option>
                                <option value="whatsapp">WhatsApp</option>
                                <option value="web_search">Поиск</option>
                             </select>
                             <ChevronRight size={16} className="text-gray-400 absolute right-0" />
                        </div>
                    </div>
                 </div>
              </div>

              {/* НОВАЯ НИЖНЯЯ ПАНЕЛЬ (БЕЗ СЕРОГО ФОНА) */}
              <div className="flex justify-between items-center px-6 py-4 bg-[#F2F2F7] pb-8">
                  <button onClick={() => setHasDate(!hasDate)} className="text-blue-600 active:opacity-50 transition-opacity"><CalendarIcon size={28} /></button>
                  <button className="text-blue-600 active:opacity-50 transition-opacity"><MapPin size={28} /></button>
                  <button onClick={() => setNewT({...newT, priority: newT.priority === 5 ? 3 : 5})} className={`transition-colors ${newT.priority === 5 ? 'text-orange-500 fill-orange-500' : 'text-blue-600'}`}><Flag size={28} /></button>
                  <button className="text-blue-600 active:opacity-50 transition-opacity"><Camera size={28} /></button>
              </div>

           </div>
        </div>
      )}
    </div>
  );
};

export default App;