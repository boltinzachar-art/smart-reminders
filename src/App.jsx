import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import WebApp from '@twa-dev/sdk';
import { Plus, Search, ExternalLink, RefreshCw, RotateCcw, Trash2, Calendar } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, TouchSensor } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- КАРТОЧКА ЗАДАЧИ ---
const SortableTaskItem = ({ task, completeTask, deleteTask, restoreTask, performAction, formatTime, isOverdue, isTrashMode }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const [isFlashing, setIsFlashing] = useState(false);

  const handleComplete = (e) => {
    e.stopPropagation();
    setIsFlashing(true);
    setTimeout(() => {
        completeTask(task);
        setTimeout(() => setIsFlashing(false), 100); 
    }, 600); 
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : 'all 0.3s ease',
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.9 : 1,
    scale: isDragging ? '1.02' : '1',
  };

  const dndProps = isTrashMode ? {} : { ...attributes, ...listeners };

  return (
    <div 
        ref={setNodeRef} 
        style={style} 
        {...dndProps}
        className={`
            group w-full bg-white rounded-xl p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] 
            flex items-start gap-3 touch-manipulation transition-all duration-500
            ${isFlashing ? 'bg-gray-50' : 'bg-white'} 
            ${isDragging ? 'shadow-xl ring-2 ring-blue-500/20' : ''}
        `}
    >
       {!isTrashMode ? (
           <button 
             onPointerDown={(e) => e.stopPropagation()}
             onClick={handleComplete}
             className={`
                mt-0.5 shrink-0 w-[24px] h-[24px] rounded-full border-2 transition-all duration-300 flex items-center justify-center
                ${isFlashing ? 'bg-blue-500 border-blue-500 scale-110' : task.completed ? 'bg-blue-500 border-blue-500' : 'border-gray-300 hover:border-blue-500 bg-transparent'}
             `}
           >
             {(isFlashing || task.completed) && <div className="w-2.5 h-2.5 bg-white rounded-full animate-in zoom-in duration-200" />}
           </button>
       ) : (
           <button onClick={() => restoreTask(task.id)} className="mt-0.5 shrink-0 text-blue-600 p-1"><RotateCcw size={20} /></button>
       )}
       
       <div className="flex-1 min-w-0 pt-0.5">
          <span className={`text-[17px] leading-tight break-words transition-colors duration-500 ${(task.completed || isFlashing) ? 'text-gray-400 line-through' : 'text-black font-normal'}`}>
              {task.title}
          </span>

          {task.description && (
            <p className="text-gray-400 font-semibold text-[13px] mt-1 line-clamp-2 leading-snug break-words">{task.description}</p>
          )}

          {/* Мета-данные (показываем, только если есть время или тип действия) */}
          <div className="flex items-center flex-wrap gap-2 mt-1.5">
             {task.next_run && (
                 <span className={`text-xs font-semibold ${isOverdue(task.next_run) && !task.completed ? 'text-red-500' : 'text-gray-400'}`}>
                    {formatTime(task.next_run)}
                 </span>
             )}
             
             {task.frequency !== 'once' && (
               <span className="text-gray-400 flex items-center text-xs gap-0.5 font-medium">
                 <RefreshCw size={10} /> {task.frequency}
               </span>
             )}

             {task.type !== 'reminder' && (
                <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); performAction(task); }} className="ml-auto text-blue-600 text-xs font-bold flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded">
                   <ExternalLink size={10}/> {task.type}
                </button>
             )}
          </div>
       </div>

       {isTrashMode && <button onClick={() => deleteTask(task.id)} className="shrink-0 text-red-500 p-1"><Trash2 size={18} /></button>}
    </div>
  );
};

const App = () => {
  const [tasks, setTasks] = useState(() => {
    const saved = localStorage.getItem('tasks');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filter, setFilter] = useState('all'); 
  const [searchQuery, setSearchQuery] = useState('');
  const [userId, setUserId] = useState(null);

  const [newTask, setNewTask] = useState({ title: '', description: '', type: 'reminder', frequency: 'once', next_run: '', priority: 3 });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }), 
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    window.addEventListener('online', () => setIsOnline(true));
    window.addEventListener('offline', () => setIsOnline(false));

    if (WebApp.initDataUnsafe.user) {
      setUserId(WebApp.initDataUnsafe.user.id);
      WebApp.expand();
      // ВАЖНО: Включаем это, но основной фикс - в CSS
      WebApp.enableClosingConfirmation(); 
      WebApp.setHeaderColor('#F2F2F7'); 
      WebApp.setBackgroundColor('#F2F2F7');
    } else {
      setUserId(777);
    }
  }, []);

  useEffect(() => { localStorage.setItem('tasks', JSON.stringify(tasks)); }, [tasks]);

  useEffect(() => {
    if (userId && isOnline) {
      syncTasks();
      const interval = setInterval(syncTasks, 30000);
      return () => clearInterval(interval);
    }
  }, [userId, isOnline]);

  const syncTasks = async () => {
    try {
      let query = supabase
        .from('tasks')
        .select('*')
        .eq('telegram_user_id', userId)
        .order('position', { ascending: true });

      const { data, error } = await query;
      if (error) throw error;
      
      if (data) {
        const localTempTasks = tasks.filter(t => t.id.toString().startsWith('temp-'));
        const combined = [...data, ...localTempTasks]; 
        setTasks(combined);
      }
    } catch (error) {
      console.error('Sync error:', error);
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      setTasks((items) => {
        const oldIndex = items.findIndex(t => t.id === active.id);
        const newIndex = items.findIndex(t => t.id === over.id);
        const newOrder = arrayMove(items, oldIndex, newIndex);
        if (isOnline) updatePositions(newOrder);
        return newOrder;
      });
    }
  };

  const updatePositions = async (orderedTasks) => {
    const updates = orderedTasks.map((t, index) => ({
        id: t.id, position: index, title: t.title, telegram_user_id: userId 
    })).filter(t => !t.id.toString().startsWith('temp-'));
    if (updates.length > 0) await supabase.from('tasks').upsert(updates);
  };

  const createTask = async () => {
    if (!newTask.title) return alert('Название?');
    
    // ТЕПЕРЬ МОЖНО NULL (БЕЗ ВРЕМЕНИ)
    const runTime = newTask.next_run ? newTask.next_run : null;

    let template = null;
    if (newTask.type === 'email') template = { to: "", subject: newTask.title, body: newTask.description };
    if (newTask.type === 'whatsapp') template = { phone: "", message: newTask.title };
    if (newTask.type === 'web_search') template = { query: newTask.title };

    const optimisticTask = {
      ...newTask,
      next_run: runTime,
      telegram_user_id: userId,
      status: 'active',
      completed: false,
      is_deleted: false,
      position: tasks.length,
      id: 'temp-' + Date.now() 
    };

    setTasks(prev => [...prev, optimisticTask]);
    setShowAddModal(false);
    setNewTask({ title: '', description: '', type: 'reminder', frequency: 'once', next_run: '', priority: 3 });

    if (isOnline) {
        const { id, ...taskForDb } = optimisticTask;
        try {
            const { data } = await supabase.from('tasks').insert([taskForDb]).select();
            if (data) setTasks(prev => prev.map(t => t.id === optimisticTask.id ? data[0] : t));
        } catch (e) { console.error(e); }
    }
  };

  const completeTask = async (task) => {
    const isRecurring = task.frequency !== 'once' && task.next_run; // Повтор только если есть дата
    
    setTasks(current => current.map(t => {
        if (t.id === task.id) {
            return isRecurring 
                ? { ...t, next_run: calculateNextRun(t.next_run, t.frequency) }
                : { ...t, completed: true };
        }
        return t;
    }));

    if (!isRecurring) {
        setTimeout(() => setTasks(curr => curr.filter(t => t.id !== task.id)), 300);
    }

    if (isOnline && !task.id.toString().startsWith('temp-')) {
        if (isRecurring) {
            const nextRun = calculateNextRun(task.next_run, task.frequency);
            await supabase.from('tasks').update({ next_run: nextRun }).eq('id', task.id);
        } else {
            await supabase.from('tasks').update({ completed: true }).eq('id', task.id);
        }
    }
  };

  const deleteTask = async (taskId) => {
    if (filter === 'trash') {
        if (!confirm('Удалить навсегда?')) return;
        setTasks(curr => curr.filter(t => t.id !== taskId));
        if (isOnline && !taskId.toString().startsWith('temp-')) await supabase.from('tasks').delete().eq('id', taskId);
    } else {
        setTasks(curr => curr.map(t => t.id === taskId ? { ...t, is_deleted: true } : t));
        if (isOnline && !taskId.toString().startsWith('temp-')) await supabase.from('tasks').update({ is_deleted: true }).eq('id', taskId);
    }
  };

  const restoreTask = async (taskId) => {
      setTasks(curr => curr.map(t => t.id === taskId ? { ...t, is_deleted: false } : t));
      if (isOnline && !taskId.toString().startsWith('temp-')) await supabase.from('tasks').update({ is_deleted: false }).eq('id', taskId);
  };

  const calculateNextRun = (current, freq) => {
    if (!current) return null;
    const date = new Date(current);
    if (freq === 'daily') date.setDate(date.getDate() + 1);
    if (freq === 'weekly') date.setDate(date.getDate() + 7);
    if (freq === 'monthly') date.setMonth(date.getMonth() + 1);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };

  const performAction = (task) => {
    const text = encodeURIComponent(task.title + (task.description ? `\n${task.description}` : ''));
    if (task.type === 'email') window.open(`mailto:?subject=${encodeURIComponent(task.title)}&body=${text}`);
    if (task.type === 'whatsapp') window.open(`https://wa.me/?text=${text}`);
    if (task.type === 'web_search') window.open(`https://www.google.com/search?q=${encodeURIComponent(task.title)}`);
  };

  const getFilteredTasks = () => {
    let filtered = tasks;
    if (searchQuery) filtered = filtered.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    if (filter === 'trash') return filtered.filter(t => t.is_deleted);
    filtered = filtered.filter(t => !t.is_deleted);

    switch (filter) {
      case 'today': return filtered.filter(t => !t.completed && t.next_run && new Date(t.next_run) >= todayStart && new Date(t.next_run) < tomorrowStart);
      case 'upcoming': return filtered.filter(t => !t.completed && t.next_run && new Date(t.next_run) >= tomorrowStart);
      case 'completed': return filtered.filter(t => t.completed);
      // ALL теперь показывает все активные (и с датой, и без)
      default: return filtered.filter(t => !t.completed);
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const isToday = date.toDateString() === new Date().toDateString();
    return isToday ? date.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'}) : date.toLocaleDateString('ru-RU', {day:'numeric', month:'short'}) + ' ' + date.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'});
  };

  const isOverdue = (dateStr) => dateStr && new Date(dateStr) < new Date();
  const filteredList = getFilteredTasks();
  const overdueCount = tasks.filter(t => !t.completed && !t.is_deleted && isOverdue(t.next_run)).length;

  return (
    <div className="min-h-[100dvh] w-full bg-[#F2F2F7] text-black font-sans flex flex-col">
      {/* ШАПКА */}
      <div className="w-full px-4 pt-14 pb-2 bg-[#F2F2F7] sticky top-0 z-20">
        <div className="flex justify-between items-center mb-3">
           <h1 className="text-3xl font-bold text-black tracking-tight ml-1">
             {filter === 'trash' ? 'Корзина' : filter === 'completed' ? 'Выполнено' : 'Напоминания'}
           </h1>
           <div className="flex items-center gap-2">
               {!isOnline && <CloudOff className="text-gray-400" size={20} />}
               {overdueCount > 0 && <span className="text-red-500 font-semibold text-sm bg-white px-2 py-1 rounded-lg shadow-sm">{overdueCount}</span>}
           </div>
        </div>
        <div className="relative mb-4 w-full">
          <Search className="absolute left-3 top-2 text-gray-400" size={18} />
          <input className="w-full pl-9 pr-4 py-2 bg-[#E3E3E8] rounded-xl text-base text-black placeholder-gray-500 focus:outline-none focus:bg-white transition-colors" placeholder="Поиск" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
        <div className="w-full overflow-x-auto hide-scrollbar">
           <div className="flex gap-2 pb-2">
             {[
               {id: 'all', label: 'Все'}, 
               {id: 'today', label: 'Сегодня'}, 
               {id: 'upcoming', label: 'Будущие'},
               {id: 'completed', label: 'Готовые'},
               {id: 'trash', label: 'Корзина'}
             ].map(f => (
               <button key={f.id} onClick={() => setFilter(f.id)} className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${filter === f.id ? 'bg-black text-white' : 'bg-white text-gray-600 shadow-sm'}`}>
                 {f.label}
               </button>
             ))}
           </div>
        </div>
      </div>

      {/* СПИСОК */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="flex-1 w-full px-4 pb-32 space-y-3">
            <SortableContext items={filteredList} strategy={verticalListSortingStrategy}>
                {filteredList.length === 0 ? (
                    <div className="text-center py-20 text-gray-400"><p>Пусто</p></div>
                ) : (
                    filteredList.map(task => (
                        <SortableTaskItem 
                            key={task.id} 
                            task={task} 
                            completeTask={completeTask} 
                            deleteTask={deleteTask} 
                            restoreTask={restoreTask}
                            performAction={performAction}
                            formatTime={formatTime}
                            isOverdue={(d) => d && new Date(d) < new Date()}
                            isTrashMode={filter === 'trash'}
                        />
                    ))
                )}
            </SortableContext>
        </div>
      </DndContext>

      {/* НИЖНЯЯ ПАНЕЛЬ */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F2F2F7]/90 backdrop-blur-md border-t border-gray-200 flex justify-between items-center z-30">
         <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 text-blue-600 font-bold text-lg active:opacity-70 transition">
            <div className="bg-blue-600 text-white rounded-full p-1"><Plus size={22} strokeWidth={3} /></div>
            Новое напоминание
         </button>
      </div>

      {/* МОДАЛКА */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
           <div className="bg-[#F2F2F7] w-full sm:max-w-md rounded-t-2xl p-4 animate-slide-up max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="flex justify-between items-center mb-4 px-2">
                 <button onClick={() => setShowAddModal(false)} className="text-blue-600 text-[17px]">Отмена</button>
                 <h3 className="font-bold text-black text-[17px]">Новое</h3>
                 <button onClick={createTask} className="text-blue-600 font-bold text-[17px]">Добавить</button>
              </div>
              <div className="bg-white rounded-xl overflow-hidden mb-6 shadow-sm">
                 <input className="w-full p-4 bg-white text-[17px] border-b border-gray-100 focus:outline-none text-black placeholder-gray-400" placeholder="Название" value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} autoFocus />
                 <textarea className="w-full p-4 bg-white text-[17px] focus:outline-none resize-none h-24 text-black placeholder-gray-400" placeholder="Заметки" value={newTask.description} onChange={e => setNewTask({...newTask, description: e.target.value})} />
              </div>
              <div className="bg-white rounded-xl overflow-hidden shadow-sm space-y-[1px] bg-gray-200">
                 <div className="bg-white p-3.5 flex justify-between items-center">
                    <span className="text-black text-[17px]">Дата и время</span>
                    <input type="datetime-local" className="bg-[#F2F2F7] text-black rounded-md p-1 text-[15px] outline-none" value={newTask.next_run} onChange={e => setNewTask({...newTask, next_run: e.target.value})} />
                 </div>
                 <div className="bg-white p-3.5 flex justify-between items-center relative">
                    <span className="text-black text-[17px]">Тип</span>
                    <div className="flex items-center gap-1">
                        <select className="appearance-none bg-transparent text-blue-600 text-[17px] text-right outline-none pr-4 z-10 relative" value={newTask.type} onChange={e => setNewTask({...newTask, type: e.target.value})}>
                           <option value="reminder">Нет</option>
                           <option value="email">Email</option>
                           <option value="whatsapp">WhatsApp</option>
                           <option value="web_search">Поиск</option>
                        </select>
                        <ChevronRight size={16} className="text-gray-300 absolute right-0" />
                    </div>
                 </div>
                 <div className="bg-white p-3.5 flex justify-between items-center relative">
                     <span className="text-black text-[17px]">Повтор</span>
                     <div className="flex items-center gap-1">
                         <select className="appearance-none bg-transparent text-blue-600 text-[17px] text-right outline-none pr-4 z-10 relative" value={newTask.frequency} onChange={e => setNewTask({...newTask, frequency: e.target.value})}>
                             <option value="once">Никогда</option>
                             <option value="daily">Ежедневно</option>
                             <option value="weekly">Еженедельно</option>
                             <option value="monthly">Ежемесячно</option>
                         </select>
                         <ChevronRight size={16} className="text-gray-300 absolute right-0" />
                     </div>
                 </div>
              </div>
              <div className="h-6"></div> 
           </div>
        </div>
      )}
    </div>
  );
};

export default App;