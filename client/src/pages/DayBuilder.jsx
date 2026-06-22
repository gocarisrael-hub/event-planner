import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import AddActivityRow from '../components/AddActivityRow.jsx';
import BudgetMeter from '../components/BudgetMeter.jsx';
import TimelineItem from '../components/TimelineItem.jsx';
import { useCatalogStore } from '../store/useCatalogStore.js';
import { useEventStore } from '../store/useEventStore.js';
import { whenLabel } from '../utils/format.js';

export default function DayBuilder() {
  const { id } = useParams();
  const { event, items, loading, load, addItem, updateItem, removeItem, setItemsOrder } = useEventStore();
  const loadCatalog = useCatalogStore((s) => s.load);
  const refreshCatalog = useCatalogStore((s) => s.refresh);

  useEffect(() => { load(id); }, [id]);
  useEffect(() => { loadCatalog(); }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  if (loading || !event) return <p className="text-slate-400">טוען…</p>;

  const onAdd = async (data) => {
    await addItem(data);
    if (!data.from_catalog_id) refreshCatalog(); // new activity landed in the catalog
  };

  const onDragEnd = (e) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = items.findIndex((i) => i.id === active.id);
    const newI = items.findIndex((i) => i.id === over.id);
    setItemsOrder(arrayMove(items, oldI, newI));
  };

  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-6 items-start">
      <div>
        <Link to="/" className="text-sm text-slate-400 hover:text-ocar">← הימים שלי</Link>
        <div className="flex items-start justify-between mt-1 mb-1">
          <h1 className="text-2xl font-bold">{event.title}</h1>
        </div>
        <p className="text-slate-500 mb-5 text-sm">
          {[event.client_name, event.group_size && `${event.group_size} משתתפים`, whenLabel(event)]
            .filter(Boolean)
            .join(' · ')}
        </p>

        <div className="mb-4">
          <AddActivityRow onAdd={onAdd} />
        </div>

        {items.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400">
            עדיין אין פעילויות. הקלד שם פעילות למעלה כדי להתחיל את הלו״ז.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {items.map((item) => (
                  <TimelineItem key={item.id} item={item} onChange={updateItem} onRemove={removeItem} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20">
        <BudgetMeter items={items} budget={event.budget} groupSize={event.group_size} />
        <Link
          to={`/day/${event.id}/proposal`}
          className="block text-center bg-ocar-dark text-white px-4 py-3 rounded-xl font-medium hover:opacity-90"
        >
          תצוגת הצעה ל-PDF →
        </Link>
        {event.requests && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm">
            <div className="font-medium mb-1">מה הם רצו</div>
            <p className="text-slate-500 whitespace-pre-wrap">{event.requests}</p>
          </div>
        )}
      </aside>
    </div>
  );
}
