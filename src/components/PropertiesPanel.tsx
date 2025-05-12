import React, { useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../context/AuthContext';

import type { 
  ActivityLogEntry, 
  ChecklistItem, 
  ChecklistUpdateAction,
  TaskData as AppTaskData
} from '../App';

interface PropertiesPanelProps {
  selectedObject: THREE.Mesh | null;
  socket: Socket | null;
  onPropertyUpdate: (
    property: 'taskTitle' | 'taskDescription' | 'taskChecklistUpdate',
    value: string | ChecklistUpdateAction,
    oldValue: string | ChecklistItem[]
  ) => void;
}

interface ScaleState {
  x: number;
  y: number;
  z: number;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ selectedObject, socket, onPropertyUpdate }) => {
  const { authState } = useAuth(); // Get auth context
  const [objectColor, setObjectColor] = useState('#ffffff');
  const [objectScale, setObjectScale] = useState<ScaleState>({ x: 1, y: 1, z: 1 });
  const [taskTitle, setTaskTitle] = useState('');
  const [taskStatus, setTaskStatus] = useState<'To Do' | 'In Progress' | 'Done'>('To Do');
  const [taskDescription, setTaskDescription] = useState('');
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newChecklistItemText, setNewChecklistItemText] = useState('');
  const [editingChecklistItem, setEditingChecklistItem] = useState<{ id: string; text: string } | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);

  useEffect(() => {
    console.log('[PropertiesPanel useEffect] Selected object changed:', selectedObject?.userData?.sharedId);
    if (selectedObject) {
      if (selectedObject.material instanceof THREE.MeshStandardMaterial) {
        setObjectColor('#' + selectedObject.material.color.getHexString());
      }
      setObjectScale({ x: selectedObject.scale.x, y: selectedObject.scale.y, z: selectedObject.scale.z });

      if (selectedObject.userData.taskData) {
        const taskData = selectedObject.userData.taskData as AppTaskData;
        console.log('[PropertiesPanel useEffect] TaskData FOUND for', selectedObject.userData.sharedId, JSON.stringify(taskData));
        setTaskTitle(taskData.title || '');
        setTaskStatus(taskData.status || 'To Do');
        setTaskDescription(taskData.description || '');
        setChecklist(taskData.checklist ? JSON.parse(JSON.stringify(taskData.checklist)) : []); // Deep copy for local state
        setActivityLog(taskData.activityLog ? JSON.parse(JSON.stringify(taskData.activityLog)) : []); // Deep copy for local state
      } else {
        console.log('[PropertiesPanel useEffect] No TaskData for', selectedObject.userData.sharedId);
        setTaskTitle(selectedObject.userData.sharedId || 'Task');
        setTaskStatus('To Do');
        setTaskDescription('');
        setChecklist([]);
        setActivityLog([]);
      }
    } else {
      console.log('[PropertiesPanel useEffect] Selected object is NULL');
      setObjectColor('#ffffff');
      setObjectScale({ x: 1, y: 1, z: 1 });
      setTaskTitle('');
      setTaskStatus('To Do');
      setTaskDescription('');
      setChecklist([]);
      setNewChecklistItemText('');
      setEditingChecklistItem(null);
      setActivityLog([]);
    }
  }, [selectedObject]);

  const handleObjectColorChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = event.target.value;
    setObjectColor(newColor);

    if (selectedObject && selectedObject.material instanceof THREE.MeshStandardMaterial && socket) {
      selectedObject.material.color.set(newColor);
      socket.emit('object-property-updated', {
        objectId: selectedObject.userData.sharedId,
        property: 'color',
        value: newColor,
        userId: socket.id,
      });
    }
  };

  const handleObjectScaleChange = (axis: 'x' | 'y' | 'z', value: string) => {
    const newScaleValue = parseFloat(value);
    if (isNaN(newScaleValue) || !selectedObject || !socket) return;

    const newScale = { ...objectScale, [axis]: newScaleValue };

    selectedObject.scale[axis] = newScaleValue;
    setObjectScale(newScale);

    socket.emit('object-property-updated', {
      objectId: selectedObject.userData.sharedId,
      property: 'scale',
      value: {
        x: selectedObject.scale.x,
        y: selectedObject.scale.y,
        z: selectedObject.scale.z,
      },
      userId: socket.id,
    });
  };

  const handleTaskTitleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = event.target.value;
    setTaskTitle(newTitle); // Update local state immediately for responsiveness

    if (selectedObject) {
      const oldTitle = selectedObject.userData.taskData?.title || '';
      console.log(`[PropertiesPanel handleTaskTitleChange] Old: "${oldTitle}", New: "${newTitle}"`);
      onPropertyUpdate('taskTitle', newTitle, oldTitle);
    }
  };

  const handleTaskStatusChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = event.target.value as 'To Do' | 'In Progress' | 'Done';
    setTaskStatus(newStatus);
    if (selectedObject && socket) {
      const oldStatus = selectedObject.userData.taskData?.status || 'To Do';
      if (!selectedObject.userData.taskData) {
        selectedObject.userData.taskData = { title: taskTitle, status: newStatus, description: taskDescription, checklist: checklist, activityLog: activityLog };
      } else {
        selectedObject.userData.taskData.status = newStatus;
      }
      socket.emit('object-property-updated', {
        objectId: selectedObject.userData.sharedId,
        property: 'taskStatus',
        value: newStatus,
        userId: socket.id,
        activityLogEntry: {
          timestamp: new Date().toISOString(),
          userId: socket.id || 'unknown',
          action: 'Task status updated via panel',
          details: `Status changed from '${oldStatus}' to '${newStatus}'`
        }
      });
    }
  };

  const handleTaskDescriptionChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newDescription = event.target.value;
    setTaskDescription(newDescription); // Update local state immediately for responsiveness

    if (selectedObject) {
      const oldDescription = selectedObject.userData.taskData?.description || '';
      onPropertyUpdate('taskDescription', newDescription, oldDescription);
    }
  };

  const handleChecklistAction = useCallback((checklistAction: ChecklistUpdateAction) => {
    if (!selectedObject || !socket?.id) return;

    const oldChecklist = selectedObject.userData.taskData?.checklist 
      ? JSON.parse(JSON.stringify(selectedObject.userData.taskData.checklist)) 
      : [];
    
    let updatedChecklist = [...checklist];
    if (checklistAction.action === 'add' && checklistAction.item) {
      updatedChecklist.push(checklistAction.item);
    } else if (checklistAction.action === 'remove' && checklistAction.itemId) {
      updatedChecklist = updatedChecklist.filter(item => item.id !== checklistAction.itemId);
    } else if (checklistAction.action === 'toggle' && checklistAction.itemId) {
      updatedChecklist = updatedChecklist.map(item =>
        item.id === checklistAction.itemId ? { ...item, completed: checklistAction.completed! } : item
      );
    } else if (checklistAction.action === 'editText' && checklistAction.itemId && checklistAction.newText !== undefined) {
      updatedChecklist = updatedChecklist.map(item =>
        item.id === checklistAction.itemId ? { ...item, text: checklistAction.newText! } : item
      );
    }
    setChecklist(updatedChecklist); // Optimistically update local state

    onPropertyUpdate('taskChecklistUpdate', checklistAction, oldChecklist);

  }, [selectedObject, socket, checklist, onPropertyUpdate]);

  const handleAddChecklistItem = () => {
    if (newChecklistItemText.trim() === '') return;
    const newItem: ChecklistItem = {
      id: uuidv4(),
      text: newChecklistItemText.trim(),
      completed: false,
    };
    handleChecklistAction({ action: 'add', item: newItem });
    setNewChecklistItemText('');
  };

  const handleToggleChecklistItem = (itemId: string) => {
    const item = checklist.find(i => i.id === itemId);
    if (item) {
      handleChecklistAction({ action: 'toggle', itemId, completed: !item.completed });
    }
  };

  const handleRemoveChecklistItem = (itemId: string) => {
    handleChecklistAction({ action: 'remove', itemId });
  };

  const handleEditChecklistItemText = (itemId: string, currentText: string) => {
    setEditingChecklistItem({ id: itemId, text: currentText });
  };

  const handleSaveEditedChecklistItemText = (itemId: string) => {
    if (!editingChecklistItem || editingChecklistItem.id !== itemId || editingChecklistItem.text.trim() === '') {
      setEditingChecklistItem(null);
      return;
    }
    const newText = editingChecklistItem.text.trim();
    handleChecklistAction({ action: 'editText', itemId, newText });
    setEditingChecklistItem(null);
  };

  const formatTimestamp = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  if (!selectedObject) {
    return (
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        background: 'rgba(50, 50, 50, 0.7)',
        color: 'white',
        padding: '15px',
        borderRadius: '8px',
        zIndex: 200,
        fontFamily: 'Arial, sans-serif',
        width: '220px',
        boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
      }}>
        <p style={{ margin: 0, textAlign: 'center' }}>No object selected</p>
      </div>
    );
  }

  return (
    <div style={{
      position: 'absolute',
      bottom: '20px',
      left: '20px',
      background: 'rgba(50, 50, 50, 0.9)',
      color: 'white',
      padding: '20px',
      borderRadius: '8px',
      zIndex: 200,
      fontFamily: 'Arial, sans-serif',
      width: '300px',
      maxHeight: 'calc(100vh - 40px)',
      overflowY: 'auto',
      boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
    }}>
      <h4 style={{ marginTop: 0, marginBottom: '15px', borderBottom: '1px solid #555', paddingBottom: '10px' }}>
        Properties: <span style={{ fontWeight: 'normal' }}>{selectedObject.userData.sharedId}</span>
      </h4>

      <div style={{ marginBottom: '15px' }}>
        <label htmlFor="objectColor" style={{ display: 'block', marginBottom: '5px' }}>Color:</label>
        <input
          type="color"
          id="objectColor"
          value={objectColor}
          onChange={handleObjectColorChange}
          style={{ width: '100%', height: '30px', border: '1px solid #666', borderRadius: '4px', backgroundColor: '#444', cursor: 'pointer' }}
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>Scale:</label>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {['x', 'y', 'z'].map(axis => (
            <div key={axis} style={{ flex: 1, marginRight: axis !== 'z' ? '10px' : '0' }}>
              <label htmlFor={`scale-${axis}`} style={{ display: 'block', marginBottom: '3px' }}>{axis.toUpperCase()}:</label>
              <input
                type="number"
                id={`scale-${axis}`}
                value={objectScale[axis as keyof ScaleState]}
                onChange={(e) => handleObjectScaleChange(axis as 'x' | 'y' | 'z', e.target.value)}
                step={0.1}
                style={{ width: '100%', padding: '8px', border: '1px solid #666', borderRadius: '4px', backgroundColor: '#444', color: '#fff', boxSizing: 'border-box' }}
              />
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label htmlFor="taskTitle" style={{ display: 'block', marginBottom: '5px' }}>Task Title:</label>
        <input
          type="text"
          id="taskTitle"
          value={taskTitle}
          onChange={handleTaskTitleChange}
          style={{ width: '100%', padding: '8px', border: '1px solid #666', borderRadius: '4px', backgroundColor: '#444', color: '#fff', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label htmlFor="taskStatus" style={{ display: 'block', marginBottom: '5px' }}>Status:</label>
        <select
          id="taskStatus"
          value={taskStatus}
          onChange={handleTaskStatusChange}
          style={{ width: '100%', padding: '8px', border: '1px solid #666', borderRadius: '4px', backgroundColor: '#444', color: '#fff' }}
        >
          <option value="To Do">To Do</option>
          <option value="In Progress">In Progress</option>
          <option value="Done">Done</option>
        </select>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label htmlFor="taskDescription" style={{ display: 'block', marginBottom: '5px' }}>Description:</label>
        <textarea
          id="taskDescription"
          value={taskDescription}
          onChange={handleTaskDescriptionChange}
          rows={3}
          style={{ width: '100%', padding: '8px', border: '1px solid #666', borderRadius: '4px', backgroundColor: '#444', color: '#fff', boxSizing: 'border-box', resize: 'vertical' }}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h5 style={{ marginBottom: '10px', borderBottom: '1px solid #444', paddingBottom: '5px' }}>Checklist</h5>
        {checklist.length === 0 && <p style={{ fontSize: '0.9em', color: '#aaa' }}>No items yet.</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {checklist.map(item => (
            <li key={item.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', padding: '5px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px' }}>
              <input
                type="checkbox"
                checked={item.completed}
                onChange={() => handleToggleChecklistItem(item.id)}
                style={{ marginRight: '10px', cursor: 'pointer' }}
              />
              {editingChecklistItem?.id === item.id ? (
                <input
                  type="text"
                  value={editingChecklistItem.text}
                  onChange={(e) => setEditingChecklistItem(prev => prev ? { ...prev, text: e.target.value } : null)}
                  onBlur={() => handleSaveEditedChecklistItemText(item.id)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveEditedChecklistItemText(item.id)}
                  autoFocus
                  style={{ flexGrow: 1, padding: '5px', border: '1px solid #777', borderRadius: '3px', backgroundColor: '#555', color: '#fff' }}
                />
              ) : (
                <span
                  onClick={() => handleEditChecklistItemText(item.id, item.text)}
                  style={{ flexGrow: 1, textDecoration: item.completed ? 'line-through' : 'none', opacity: item.completed ? 0.7 : 1, cursor: 'pointer' }}
                >
                  {item.text}
                </span>
              )}
              <button
                onClick={() => handleRemoveChecklistItem(item.id)}
                style={{ marginLeft: '10px', background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: '1.1em' }}
                title="Remove item"
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
        <div style={{ display: 'flex', marginTop: '10px' }}>
          <input
            type="text"
            value={newChecklistItemText}
            onChange={(e) => setNewChecklistItemText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddChecklistItem()}
            placeholder="Add checklist item..."
            style={{ flexGrow: 1, marginRight: '8px', padding: '8px', border: '1px solid #666', borderRadius: '4px', backgroundColor: '#444', color: '#fff' }}
          />
          <button
            onClick={handleAddChecklistItem}
            style={{ padding: '8px 12px', border: 'none', borderRadius: '4px', backgroundColor: '#007bff', color: 'white', cursor: 'pointer' }}
          >
            Add
          </button>
        </div>
      </div>

      <div>
        <h5 style={{ marginBottom: '10px', borderBottom: '1px solid #444', paddingBottom: '5px' }}>Activity Log</h5>
        {activityLog.length === 0 && <p style={{ fontSize: '0.9em', color: '#aaa' }}>No activity yet.</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '200px', overflowY: 'auto' }}>
          {activityLog.slice().reverse().map((entry, index) => (
            <li key={index} style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px dashed #333', fontSize: '0.85em' }}>              <div style={{ fontWeight: 'bold', color: '#bbb' }}>
                {entry.action}                <span style={{ fontWeight: 'normal', color: '#888', marginLeft: '5px' }}>
                  by {entry.userId === socket?.id || (authState.user && entry.userId === authState.user.id) 
                      ? `You (${authState.user?.username || 'Guest'})` 
                      : `User-${entry.userId.substring(0,5)}`}
                </span>
              </div>
              {entry.details && <div style={{ color: '#ccc', marginTop: '3px', wordBreak: 'break-word' }}>{entry.details}</div>}
              <div style={{ color: '#777', marginTop: '3px', fontSize: '0.9em' }}>{formatTimestamp(entry.timestamp)}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default PropertiesPanel;
