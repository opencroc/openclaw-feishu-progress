import type { TaskEvent } from '@features/tasks/types';
import { getStageKeyLabel } from '../labels';

type EventTimelineProps = {
  events: TaskEvent[];
  formatTime: (ts?: number) => string;
};

function getEventTypeLabel(type: string): string {
  if (type === 'created') return '创建';
  if (type === 'progress') return '进度';
  if (type === 'log') return '日志';
  if (type === 'waiting') return '等待';
  if (type === 'done') return '完成';
  if (type === 'failed') return '失败';
  return type;
}

export default function EventTimeline({ events, formatTime }: EventTimelineProps) {
  return (
    <div className="planet-timeline-card pixel-office-panel">
      <div className="planet-card-head">
        <h3>事件时间线</h3>
        <span>{events.length} 条</span>
      </div>
      <div className="planet-event-feed">
        {events.length > 0 ? events.map((event, index) => (
          <div key={`${event.time}-${event.type}-${index}`} className="planet-event-item">
            <div className={`planet-event-dot ${event.level || 'info'}`} />
            <div className="planet-event-copy">
              <div className="planet-event-message">{event.message}</div>
              <div className="planet-event-meta">
                {formatTime(event.time)} · {getEventTypeLabel(event.type)}
                {typeof event.progress === 'number' ? ` · ${event.progress}%` : ''}
                {event.stageKey ? ` · ${getStageKeyLabel(event.stageKey)}` : ''}
              </div>
            </div>
          </div>
        )) : (
          <div className="task-empty">还没有记录到任务事件。</div>
        )}
      </div>
    </div>
  );
}
