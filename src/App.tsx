import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Socket } from 'socket.io-client';
import './App.css';
import PropertiesPanel from './components/PropertiesPanel';
import LandingPage from './components/LandingPage'; // Import LandingPage
import ThreeDApp from './components/3D/ThreeDApp'; // Import 3D App
import { useAuth } from './context/AuthContext'; // Import auth context
import { setSocket } from './services/socket'; // Import socket service

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface ActivityLogEntry {
  timestamp: string;
  userId: string; // ID of the user who performed the action
  action: string; // e.g., "created", "updated title", "changed status to In Progress", "added checklist item"
  details?: string; // e.g., new title, new status, checklist item text
}

export interface TaskData {
  title: string;
  status: 'To Do' | 'In Progress' | 'Done';
  description: string;
  checklist: ChecklistItem[];
  activityLog: ActivityLogEntry[];
}

export interface UpdateTaskPropertyCommandData {
  objectId: string;
  property: 'taskTitle' | 'taskDescription' | 'taskChecklistUpdate' | 'taskStatus';
  value: string | ChecklistUpdateAction; // string for title/description/status, ChecklistUpdateAction for checklist
  oldValue: string | ChecklistItem[]; // oldValue for title/description/status or the entire old checklist for context
  userId: string;
}

interface ListZone {
  name: 'To Do' | 'In Progress' | 'Done';
  position: THREE.Vector3;
  size: { width: number; depth: number };
  color: THREE.Color;
  mesh?: THREE.Mesh;
}

interface ObjectPropertyUpdateData {
  objectId: string;
  property: 'color' | 'scale' | 'taskTitle' | 'taskStatus' | 'taskDescription' | 'taskChecklistUpdate';
  value: string | number | { x: number; y: number; z: number } | TaskData['status'] | ChecklistUpdateAction;
  userId?: string; // User who initiated the change
  activityLogEntry?: ActivityLogEntry; // Optional log entry for this specific update
}

interface UserData {
  id: string;
  color: string;
  username?: string; // Optional username for authenticated users
}

interface CursorUpdateData {
  userId: string;
  color: string;
  position: { x: number; y: number; z: number };
}

// Updated Command interface to support imperative commands
export interface Command<T = any> {
  description: string;
  actionType: string;
  actionData: T;
  execute(): void;
  undo(): void;
}

interface MoveObjectCommandData {
  objectId: string;
  oldPosition: { x: number; y: number; z: number };
  newPosition: { x: number; y: number; z: number };
  oldRotation: { x: number; y: number; z: number; order: THREE.EulerOrder };
  newRotation: { x: number; y: number; z: number; order: THREE.EulerOrder };
  oldScale: { x: number; y: number; z: number };
  newScale: { x: number; y: number; z: number };
  oldTaskStatus?: TaskData['status'];
  newTaskStatus?: TaskData['status'];
}

interface CreateObjectCommandData {
  sharedId: string;
  type: 'cube' | 'sphere' | 'torus';
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; order?: THREE.EulerOrder };
  scale: { x: number; y: number; z: number };
  color: number;
  taskData: TaskData;
}

interface DeleteObjectCommandData {
  sharedId: string;
  type: 'cube' | 'sphere' | 'torus';
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; order: THREE.EulerOrder };
  scale: { x: number; y: number; z: number };
  color: number;
  taskData: TaskData;
}

export interface ChecklistUpdateAction {
  action: 'add' | 'remove' | 'toggle' | 'editText';
  itemId?: string;
  item?: ChecklistItem;
  newText?: string;
  completed?: boolean;
}

// @ts-ignore - Used in command pattern implementation
class MoveObjectCommandImpl implements Command<MoveObjectCommandData> {
  public actionType = 'moveObject';
  public targetObjectId: string;
  public description: string;
  public actionData: MoveObjectCommandData;

  private interactiveObjectsRef: React.MutableRefObject<THREE.Mesh[]>;
  private socketInstance: Socket;
  private animateTaskStatusUpdateFn?: (object: THREE.Mesh) => void;

  constructor(
    interactiveObjectsRef: React.MutableRefObject<THREE.Mesh[]>,
    socketInstance: Socket,
    actionData: MoveObjectCommandData,
    description: string,
    animateTaskStatusUpdateFn?: (object: THREE.Mesh) => void
  ) {
    this.interactiveObjectsRef = interactiveObjectsRef;
    this.socketInstance = socketInstance;
    this.actionData = actionData;
    this.description = description;
    this.targetObjectId = actionData.objectId;
    this.animateTaskStatusUpdateFn = animateTaskStatusUpdateFn;
  }

  private applyStateAndStatus(
    pos: { x: number; y: number; z: number },
    rot: { x: number; y: number; z: number; order: THREE.EulerOrder },
    scaleVal: { x: number; y: number; z: number },
    status?: TaskData['status']
  ): THREE.Mesh | null {
    console.log(`[MoveObjectCommandImpl] Applying state to ${this.targetObjectId}:`, { pos, rot, scaleVal, status });

    // Kill ALL existing animations on this object to prevent conflicts
    gsap.killTweensOf(`object_${this.targetObjectId}_position`);
    gsap.killTweensOf(`object_${this.targetObjectId}_rotation`);
    gsap.killTweensOf(`object_${this.targetObjectId}_scale`);

    // Also kill any animations that might be targeting the object directly
    const object = this.interactiveObjectsRef.current.find(obj => obj.userData.sharedId === this.targetObjectId);
    if (object) {
      gsap.killTweensOf(object.position);
      gsap.killTweensOf(object.rotation);
      gsap.killTweensOf(object.scale);

      if (object.material instanceof THREE.MeshStandardMaterial) {
        gsap.killTweensOf(object.material.color);
        gsap.killTweensOf(object.material.emissive);
      }

      // Store current values for logging
      const currentPos = object.position.clone();

      // CRITICAL: We need to directly set the position without GSAP for undo/redo
      // This ensures the object's actual position is updated immediately
      object.position.set(pos.x, pos.y, pos.z);
      object.rotation.set(rot.x, rot.y, rot.z, rot.order);
      object.scale.set(scaleVal.x, scaleVal.y, scaleVal.z);

      // Force the object to update its matrix
      object.updateMatrix();
      object.updateMatrixWorld(true);

      console.log(`[MoveObjectCommandImpl] Position set to:`,
        {x: object.position.x, y: object.position.y, z: object.position.z});

      // Calculate the distance moved for animation scaling
      const distanceMoved = currentPos.distanceTo(new THREE.Vector3(pos.x, pos.y, pos.z));

      // Add a visual effect to show the change
      if (object.material instanceof THREE.MeshStandardMaterial) {
        // Store original emissive
        const originalEmissive = object.material.emissive.clone();

        // Flash the object to indicate the change
        // Blue flash for visual feedback
        object.material.emissive.set(0x0066ff);

        // Restore original emissive after animation
        setTimeout(() => {
          if (object && object.material instanceof THREE.MeshStandardMaterial) {
            object.material.emissive.copy(originalEmissive);
          }
        }, 300);
      }

      // Add a small bounce effect
      const originalY = object.position.y;

      // Only do bounce if we moved a significant distance
      if (distanceMoved > 0.1) {
        // Use a simple timeout instead of GSAP to avoid animation conflicts
        setTimeout(() => {
          if (object) {
            // Small bounce up
            object.position.y += 0.2;

            // Force update
            object.updateMatrix();
            object.updateMatrixWorld(true);

            // Then bounce down after a short delay
            setTimeout(() => {
              if (object) {
                object.position.y = originalY;

                // Force update again
                object.updateMatrix();
                object.updateMatrixWorld(true);
              }
            }, 150);
          }
        }, 50);
      }

      // Handle status change
      if (status && object.userData.taskData) {
        const oldStatus = object.userData.taskData.status;

        // IMPORTANT: Always update the status, even if it appears to be the same
        // This ensures the status is properly synchronized
        console.log(`[MoveObjectCommandImpl] Setting status to ${status} (was ${oldStatus})`);
        object.userData.taskData.status = status;

        if (oldStatus !== status) {
          // Add activity log entry for the status change
          if (!object.userData.taskData.activityLog) {
            object.userData.taskData.activityLog = [];
          }

          object.userData.taskData.activityLog.push({
            timestamp: new Date().toISOString(),
            userId: this.socketInstance.id || 'system',
            action: 'Status Changed (Undo/Redo)',
            details: `Status changed from '${oldStatus}' to '${status}'`
          });
        }
      }

      return object;
    }
    console.warn(`[MoveObjectCommandImpl] Object ${this.targetObjectId} not found`);
    return null;
  }

  execute(): void {
    console.log(`[MoveCommand] Executing for ${this.targetObjectId}`, this.actionData);

    // Kill any existing animations on this object to prevent conflicts
    gsap.killTweensOf(`object_${this.targetObjectId}_position`);
    gsap.killTweensOf(`object_${this.targetObjectId}_rotation`);
    gsap.killTweensOf(`object_${this.targetObjectId}_scale`);

    // Find the object directly first to ensure it exists
    const directObject = this.interactiveObjectsRef.current.find(obj => obj.userData.sharedId === this.targetObjectId);

    if (!directObject) {
      console.error(`[MoveCommand] Object ${this.targetObjectId} not found for execute`);
      return;
    }

    // Log the current position before applying changes
    console.log(`[MoveCommand] Current position before execute:`,
      {x: directObject.position.x, y: directObject.position.y, z: directObject.position.z});

    // Apply the new state
    const object = this.applyStateAndStatus(
      this.actionData.newPosition,
      this.actionData.newRotation,
      this.actionData.newScale,
      this.actionData.newTaskStatus
    );

    if (object) {
      // Log the position after applying changes
      console.log(`[MoveCommand] Position after execute:`,
        {x: object.position.x, y: object.position.y, z: object.position.z});

      let activityLogEntry: ActivityLogEntry | undefined = undefined;

      if (this.actionData.newTaskStatus && object.userData.taskData) {
        const oldStatus = object.userData.taskData.status;
        object.userData.taskData.status = this.actionData.newTaskStatus;

        if (oldStatus !== this.actionData.newTaskStatus) {
          console.log(`[MoveCommand] Status changed from ${oldStatus} to ${this.actionData.newTaskStatus}`);

          // Animate the status change
          this.animateTaskStatusUpdateFn?.(object);

          // Create activity log entry
          activityLogEntry = {
            timestamp: new Date().toISOString(),
            userId: this.socketInstance.id || 'system',
            action: 'Task status changed',
            details: `Status changed from '${oldStatus || 'Unknown'}' to '${this.actionData.newTaskStatus}'`
          };

          // Add to activity log
          if (!object.userData.taskData.activityLog) {
            object.userData.taskData.activityLog = [];
          }
          object.userData.taskData.activityLog.push(activityLogEntry);
        }
      }

      // Emit to other clients
      this.socketInstance.emit('object-moved', {
        objectId: this.targetObjectId,
        position: this.actionData.newPosition,
        rotation: this.actionData.newRotation,
        scale: this.actionData.newScale,
        taskStatus: this.actionData.newTaskStatus,
        userId: this.socketInstance.id,
        activityLogEntry
      });

      console.log(`[MoveCommand] Executed for ${this.targetObjectId}. New Pos:`, this.actionData.newPosition, `New Status: ${this.actionData.newTaskStatus || 'unchanged'}`);
    } else {
      console.error(`[MoveCommand] Failed to execute for ${this.targetObjectId} - object not found after applyStateAndStatus`);
    }
  }

  undo(): void {
    console.log(`[MoveCommand] Undoing for ${this.targetObjectId}`, this.actionData);

    // Kill any existing animations on this object to prevent conflicts
    gsap.killTweensOf(`object_${this.targetObjectId}_position`);
    gsap.killTweensOf(`object_${this.targetObjectId}_rotation`);
    gsap.killTweensOf(`object_${this.targetObjectId}_scale`);

    // Find the object directly first to ensure it exists
    const directObject = this.interactiveObjectsRef.current.find(obj => obj.userData.sharedId === this.targetObjectId);

    if (!directObject) {
      console.error(`[MoveCommand] Object ${this.targetObjectId} not found for undo`);
      return;
    }

    // Log the current position before applying changes
    console.log(`[MoveCommand] Current position before undo:`,
      {x: directObject.position.x, y: directObject.position.y, z: directObject.position.z});
    console.log(`[MoveCommand] Restoring to position:`, this.actionData.oldPosition);

    // Apply the old state
    const object = this.applyStateAndStatus(
      this.actionData.oldPosition,
      this.actionData.oldRotation,
      this.actionData.oldScale,
      this.actionData.oldTaskStatus
    );

    if (object) {
      // Log the position after applying changes
      console.log(`[MoveCommand] Position after undo:`,
        {x: object.position.x, y: object.position.y, z: object.position.z});

      let activityLogEntry: ActivityLogEntry | undefined = undefined;

      if (this.actionData.oldTaskStatus && object.userData.taskData) {
        const currentStatus = object.userData.taskData.status;
        object.userData.taskData.status = this.actionData.oldTaskStatus;

        if (currentStatus !== this.actionData.oldTaskStatus) {
          console.log(`[MoveCommand] Undoing status change from ${currentStatus} to ${this.actionData.oldTaskStatus}`);

          // Animate the status change
          this.animateTaskStatusUpdateFn?.(object);

          // Create activity log entry
          activityLogEntry = {
            timestamp: new Date().toISOString(),
            userId: this.socketInstance.id || 'system',
            action: 'Task status changed (undo)',
            details: `Status changed from '${currentStatus || 'Unknown'}' back to '${this.actionData.oldTaskStatus}'`
          };

          // Add to activity log
          if (!object.userData.taskData.activityLog) {
            object.userData.taskData.activityLog = [];
          }
          object.userData.taskData.activityLog.push(activityLogEntry);
        }
      }

      // Emit to other clients
      this.socketInstance.emit('object-moved', {
        objectId: this.targetObjectId,
        position: this.actionData.oldPosition,
        rotation: this.actionData.oldRotation,
        scale: this.actionData.oldScale,
        taskStatus: this.actionData.oldTaskStatus,
        userId: this.socketInstance.id,
        activityLogEntry
      });

      console.log(`[MoveCommand] Undone for ${this.targetObjectId}. Old Pos:`, this.actionData.oldPosition, `Old Status: ${this.actionData.oldTaskStatus || 'unchanged'}`);
    } else {
      console.error(`[MoveCommand] Failed to undo for ${this.targetObjectId} - object not found after applyStateAndStatus`);
    }
  }
}

class UpdateTaskPropertyCommandImpl implements Command<UpdateTaskPropertyCommandData> {
  public actionType = 'updateTaskProperty';
  public targetObjectId: string;
  public description: string;
  public actionData: UpdateTaskPropertyCommandData;

  private interactiveObjectsRef: React.MutableRefObject<THREE.Mesh[]>;
  private socket: Socket;

  private oldValue: string | ChecklistItem[] | undefined;

  constructor(
    interactiveObjectsRef: React.MutableRefObject<THREE.Mesh[]>,
    socket: Socket,
    actionData: UpdateTaskPropertyCommandData,
    description: string
  ) {
    this.interactiveObjectsRef = interactiveObjectsRef;
    this.socket = socket;
    this.actionData = actionData;
    this.description = description;
    this.targetObjectId = actionData.objectId;
  }

  execute(): void {
    try {
      console.log(`[UpdateTaskPropertyCommandImpl] Executing for ${this.actionData.objectId}:`, this.actionData.property);

      const object = this.interactiveObjectsRef.current.find(obj => obj.userData.sharedId === this.actionData.objectId);
      if (!object) {
        console.error(`[UpdateTaskPropertyCommandImpl EXECUTE] Object not found: ${this.actionData.objectId}`);
        return;
      }

      // Initialize taskData if it doesn't exist
      if (!object.userData.taskData) {
        console.log(`[UpdateTaskPropertyCommandImpl] Creating new taskData for ${this.actionData.objectId}`);
        object.userData.taskData = {
          title: 'New Task',
          description: '',
          status: 'To Do',
          checklist: [],
          activityLog: []
        };
      }

      const taskData = object.userData.taskData;

      // Store old value for undo
      if (this.actionData.property === 'taskTitle') {
        this.oldValue = taskData.title;
        taskData.title = this.actionData.value as string;
        console.log(`[UpdateTaskPropertyCommandImpl] Updated title from "${this.oldValue}" to "${taskData.title}"`);
      } else if (this.actionData.property === 'taskDescription') {
        this.oldValue = taskData.description;
        taskData.description = this.actionData.value as string;
        console.log(`[UpdateTaskPropertyCommandImpl] Updated description`);
      } else if (this.actionData.property === 'taskStatus') {
        this.oldValue = taskData.status;
        const newStatus = this.actionData.value as 'To Do' | 'In Progress' | 'Done';

        // Only update if the status actually changed
        if (taskData.status !== newStatus) {
          console.log(`[UpdateTaskPropertyCommandImpl] Updating status from "${taskData.status}" to "${newStatus}"`);

          // Update the status in the task data
          taskData.status = newStatus;

          // Find the target zone for this status
          const targetZone = this.interactiveObjectsRef.current
            .find(obj => obj.userData.sharedId === this.actionData.objectId);

          if (targetZone) {
            console.log(`[UpdateTaskPropertyCommandImpl] Status change successful for ${this.actionData.objectId}`);

            // Log the updated task data to verify it's been changed
            console.log(`[UpdateTaskPropertyCommandImpl] Updated task data:`, JSON.stringify(taskData));
          } else {
            console.warn(`[UpdateTaskPropertyCommandImpl] Could not find zone for status: ${newStatus}`);
          }
        } else {
          console.log(`[UpdateTaskPropertyCommandImpl] Status already set to "${newStatus}", no change needed`);
        }
      } else if (this.actionData.property === 'taskChecklistUpdate') {
        // Make a deep copy of the checklist for undo
        this.oldValue = JSON.parse(JSON.stringify(taskData.checklist));

        const checklistAction = this.actionData.value as ChecklistUpdateAction;
        console.log(`[UpdateTaskPropertyCommandImpl] Checklist action: ${checklistAction.action}`);

        if (checklistAction.action === 'add' && checklistAction.item) {
          taskData.checklist.push(checklistAction.item);
          console.log(`[UpdateTaskPropertyCommandImpl] Added checklist item: ${checklistAction.item.text}`);
        } else if (checklistAction.action === 'remove' && checklistAction.itemId) {
          taskData.checklist = taskData.checklist.filter((item: ChecklistItem) => item.id !== checklistAction.itemId);
          console.log(`[UpdateTaskPropertyCommandImpl] Removed checklist item: ${checklistAction.itemId}`);
        } else if (checklistAction.action === 'toggle' && checklistAction.itemId) {
          taskData.checklist = taskData.checklist.map((item: ChecklistItem) => {
            if (item.id === checklistAction.itemId) {
              const newCompleted = checklistAction.completed !== undefined ? checklistAction.completed : !item.completed;
              console.log(`[UpdateTaskPropertyCommandImpl] Toggled checklist item: ${item.text} to ${newCompleted}`);
              return { ...item, completed: newCompleted };
            }
            return item;
          });
        } else if (checklistAction.action === 'editText' && checklistAction.itemId && checklistAction.newText !== undefined) {
          taskData.checklist = taskData.checklist.map((item: ChecklistItem) => {
            if (item.id === checklistAction.itemId) {
              console.log(`[UpdateTaskPropertyCommandImpl] Edited checklist item text from "${item.text}" to "${checklistAction.newText}"`);
              return { ...item, text: checklistAction.newText! };
            }
            return item;
          });
        }
      }

      // Add activity log
      if (!taskData.activityLog) taskData.activityLog = [];

      const activityLogEntry = {
        timestamp: new Date().toISOString(),
        userId: this.actionData.userId,
        action: `Updated ${this.actionData.property}`,
        details: typeof this.actionData.value === 'object' ?
          JSON.stringify(this.actionData.value) :
          String(this.actionData.value)
      };

      taskData.activityLog.push(activityLogEntry);

      // Emit socket event with full task data for better synchronization
      this.socket.emit('object-property-updated', {
        objectId: this.actionData.objectId,
        property: this.actionData.property,
        value: this.actionData.value,
        userId: this.actionData.userId,
        activityLogEntry: activityLogEntry,
        fullTaskData: JSON.parse(JSON.stringify(taskData)) // Deep copy to ensure clean data
      });

      // Visual feedback
      if (object.material instanceof THREE.MeshStandardMaterial) {
        const originalColor = object.material.color.getHex();
        object.material.color.set(0xffff00); // flash yellow
        setTimeout(() => {
          if (object.material instanceof THREE.MeshStandardMaterial) {
            object.material.color.set(originalColor);
          }
        }, 300);
      }

      // Animate object scale for feedback
      if (object instanceof THREE.Mesh) {
        const originalScale = object.scale.clone();
        gsap.to(object.scale, {
          x: originalScale.x * 1.15,
          y: originalScale.y * 1.15,
          z: originalScale.z * 1.15,
          duration: 0.12,
          yoyo: true,
          repeat: 1,
          ease: 'power1.inOut'
        });
      }

      console.log(`[UpdateTaskPropertyCommandImpl] Executed for ${this.actionData.objectId}:`, this.actionData.property, this.actionData.value);
    } catch (error) {
      console.error(`[UpdateTaskPropertyCommandImpl] Error executing:`, error);
    }
  }

  undo(): void {
    try {
      console.log(`[UpdateTaskPropertyCommandImpl] Undoing for ${this.actionData.objectId}:`, this.actionData.property);

      const object = this.interactiveObjectsRef.current.find(obj => obj.userData.sharedId === this.actionData.objectId);
      if (!object) {
        console.error(`[UpdateTaskPropertyCommandImpl UNDO] Object not found: ${this.actionData.objectId}`);
        return;
      }

      const taskData = object.userData.taskData;
      if (!taskData) {
        console.error(`[UpdateTaskPropertyCommandImpl UNDO] No taskData for object: ${this.actionData.objectId}`);
        return;
      }

      // Restore old value based on property type
      if (this.actionData.property === 'taskTitle' && typeof this.oldValue === 'string') {
        console.log(`[UpdateTaskPropertyCommandImpl] Undoing title change from "${taskData.title}" to "${this.oldValue}"`);
        taskData.title = this.oldValue;
      } else if (this.actionData.property === 'taskDescription' && typeof this.oldValue === 'string') {
        console.log(`[UpdateTaskPropertyCommandImpl] Undoing description change`);
        taskData.description = this.oldValue;
      } else if (this.actionData.property === 'taskStatus' && typeof this.oldValue === 'string') {
        console.log(`[UpdateTaskPropertyCommandImpl] Undoing status change from "${taskData.status}" to "${this.oldValue}"`);
        taskData.status = this.oldValue as 'To Do' | 'In Progress' | 'Done';
      } else if (this.actionData.property === 'taskChecklistUpdate' && Array.isArray(this.oldValue)) {
        console.log(`[UpdateTaskPropertyCommandImpl] Undoing checklist change, restoring ${this.oldValue.length} items`);
        // Deep copy to avoid reference issues
        taskData.checklist = JSON.parse(JSON.stringify(this.oldValue));
      }

      // Add activity log entry for the undo action
      if (!taskData.activityLog) taskData.activityLog = [];

      const activityLogEntry = {
        timestamp: new Date().toISOString(),
        userId: this.actionData.userId,
        action: `Undo ${this.actionData.property}`,
        details: typeof this.oldValue === 'object' ?
          JSON.stringify(this.oldValue) :
          String(this.oldValue || '')
      };

      taskData.activityLog.push(activityLogEntry);

      // Emit socket event for undo with full task data
      this.socket.emit('object-property-updated', {
        objectId: this.actionData.objectId,
        property: this.actionData.property,
        value: this.oldValue,
        userId: this.actionData.userId,
        activityLogEntry: activityLogEntry,
        fullTaskData: JSON.parse(JSON.stringify(taskData)) // Deep copy for clean data
      });

      // Visual feedback - flash cyan for undo
      if (object.material instanceof THREE.MeshStandardMaterial) {
        const originalColor = object.material.color.getHex();
        object.material.color.set(0x00ffff); // flash cyan for undo
        setTimeout(() => {
          if (object.material instanceof THREE.MeshStandardMaterial) {
            object.material.color.set(originalColor);
          }
        }, 300);
      }

      // Animate object scale for feedback - slightly different from execute
      if (object instanceof THREE.Mesh) {
        const originalScale = object.scale.clone();
        gsap.to(object.scale, {
          x: originalScale.x * 0.85,
          y: originalScale.y * 0.85,
          z: originalScale.z * 0.85,
          duration: 0.12,
          yoyo: true,
          repeat: 1,
          ease: 'power1.inOut'
        });
      }

      console.log(`[UpdateTaskPropertyCommandImpl] Undone for ${this.actionData.objectId}:`, this.actionData.property);
    } catch (error) {
      console.error(`[UpdateTaskPropertyCommandImpl] Error undoing:`, error);
    }
  }
}

// @ts-ignore - Used in command pattern implementation
class CreateObjectCommandImpl implements Command<CreateObjectCommandData> {
  public actionType = 'createObject';
  public targetObjectId: string;
  public description: string;
  public actionData: CreateObjectCommandData;

  private sceneRef: React.MutableRefObject<THREE.Scene | null>;
  private interactiveObjectsRef: React.MutableRefObject<THREE.Mesh[]>;
  private originalMaterialsRef: React.MutableRefObject<Map<THREE.Object3D, THREE.Material | THREE.Material[]>>;
  private socket: Socket;

  constructor(
    sceneRef: React.MutableRefObject<THREE.Scene | null>,
    interactiveObjectsRef: React.MutableRefObject<THREE.Mesh[]>,
    originalMaterialsRef: React.MutableRefObject<Map<THREE.Object3D, THREE.Material | THREE.Material[]>>,
    socket: Socket,
    actionData: CreateObjectCommandData,
    description: string
  ) {
    this.sceneRef = sceneRef;
    this.interactiveObjectsRef = interactiveObjectsRef;
    this.originalMaterialsRef = originalMaterialsRef;
    this.socket = socket;
    this.actionData = actionData;
    this.description = description;
    this.targetObjectId = actionData.sharedId;
  }

  execute(): void {
    if (!this.sceneRef.current) return;

    let existingObject = this.interactiveObjectsRef.current.find(obj => obj.userData.sharedId === this.actionData.sharedId);
    if (existingObject) {
      existingObject.position.set(this.actionData.position.x, this.actionData.position.y, this.actionData.position.z);
      existingObject.rotation.set(this.actionData.rotation.x, this.actionData.rotation.y, this.actionData.rotation.z, this.actionData.rotation.order);
      existingObject.scale.set(this.actionData.scale.x, this.actionData.scale.y, this.actionData.scale.z);
      if (existingObject.material instanceof THREE.MeshStandardMaterial) {
        existingObject.material.color.setHex(this.actionData.color);
      }
      existingObject.userData.originalColor = new THREE.Color(this.actionData.color);
      existingObject.userData.taskData = {
        ...this.actionData.taskData,
        activityLog: this.actionData.taskData.activityLog ? [...this.actionData.taskData.activityLog] : []
      };
      existingObject.userData.objectType = this.actionData.type;
      console.log(`[CreateCommand] Updated existing object ${this.actionData.sharedId} during execute.`);
    } else {
      let newObjectGeometry: THREE.BufferGeometry;
      if (this.actionData.type === 'cube') newObjectGeometry = new THREE.BoxGeometry(1, 1, 1);
      else if (this.actionData.type === 'sphere') newObjectGeometry = new THREE.SphereGeometry(0.75, 32, 32);
      else if (this.actionData.type === 'torus') newObjectGeometry = new THREE.TorusGeometry(0.6, 0.2, 16, 100);
      else return;

      const newObjectMaterial = new THREE.MeshStandardMaterial({ color: this.actionData.color });
      const newObject = new THREE.Mesh(newObjectGeometry, newObjectMaterial);
      newObject.position.set(this.actionData.position.x, this.actionData.position.y, this.actionData.position.z);
      newObject.rotation.set(this.actionData.rotation.x, this.actionData.rotation.y, this.actionData.rotation.z, this.actionData.rotation.order);
      newObject.scale.set(this.actionData.scale.x, this.actionData.scale.y, this.actionData.scale.z);
      newObject.userData.sharedId = this.actionData.sharedId;
      newObject.userData.originalColor = new THREE.Color(this.actionData.color);
      newObject.userData.objectType = this.actionData.type;
      newObject.userData.taskData = {
        ...this.actionData.taskData,
        activityLog: this.actionData.taskData.activityLog ? [...this.actionData.taskData.activityLog] : []
      };

      this.sceneRef.current.add(newObject);
      this.interactiveObjectsRef.current.push(newObject);
      this.originalMaterialsRef.current.set(newObject, newObjectMaterial.clone());
      console.log(`[CreateCommand] Created new object ${this.actionData.sharedId} during execute.`);
    }

    this.socket.emit('request-create-object', this.actionData);
  }

  undo(): void {
    let objectToRemove = this.interactiveObjectsRef.current.find(obj => obj.userData.sharedId === this.actionData.sharedId) || null;

    if (!this.sceneRef.current || !objectToRemove) {
        console.log(`[CreateCommand] Undo: Object ${this.actionData.sharedId} not found for removal.`);
        return;
    }

    this.sceneRef.current.remove(objectToRemove);
    this.interactiveObjectsRef.current = this.interactiveObjectsRef.current.filter(
      (obj) => obj.userData.sharedId !== this.actionData.sharedId
    );
    this.originalMaterialsRef.current.delete(objectToRemove);

    if (objectToRemove.geometry) objectToRemove.geometry.dispose();
    if (objectToRemove.material) {
        if (Array.isArray(objectToRemove.material)) {
            objectToRemove.material.forEach(mat => mat.dispose());
        } else {
            (objectToRemove.material as THREE.Material).dispose();
        }
    }

    this.socket.emit('request-delete-object', { objectId: this.actionData.sharedId });
    console.log(`[CreateCommand] Undone for ${this.targetObjectId}`);
  }
}

// @ts-ignore - Used in command pattern implementation
class DeleteObjectCommandImpl implements Command<DeleteObjectCommandData> {
  public actionType = 'deleteObject';
  public targetObjectId: string;
  public description: string;
  public actionData: DeleteObjectCommandData;

  private sceneRef: React.MutableRefObject<THREE.Scene | null>;
  private interactiveObjectsRef: React.MutableRefObject<THREE.Mesh[]>;
  private originalMaterialsRef: React.MutableRefObject<Map<THREE.Object3D, THREE.Material | THREE.Material[]>>;
  private socket: Socket;
  private selectedObjectRef: React.MutableRefObject<THREE.Mesh | null>;
  private setCurrentSelectedObjectForPanelFn: (object: THREE.Mesh | null) => void;

  constructor(
    sceneRef: React.MutableRefObject<THREE.Scene | null>,
    interactiveObjectsRef: React.MutableRefObject<THREE.Mesh[]>,
    originalMaterialsRef: React.MutableRefObject<Map<THREE.Object3D, THREE.Material | THREE.Material[]>>,
    socket: Socket,
    selectedObjectRef: React.MutableRefObject<THREE.Mesh | null>,
    setCurrentSelectedObjectForPanelFn: (object: THREE.Mesh | null) => void,
    actionData: DeleteObjectCommandData,
    description: string
  ) {
    this.sceneRef = sceneRef;
    this.interactiveObjectsRef = interactiveObjectsRef;
    this.originalMaterialsRef = originalMaterialsRef;
    this.socket = socket;
    this.selectedObjectRef = selectedObjectRef;
    this.setCurrentSelectedObjectForPanelFn = setCurrentSelectedObjectForPanelFn;
    this.actionData = actionData;
    this.description = description;
    this.targetObjectId = actionData.sharedId;
  }

  execute(): void {
    if (!this.sceneRef.current) return;
    const objectToDelete = this.interactiveObjectsRef.current.find(
      (obj) => obj.userData.sharedId === this.actionData.sharedId
    );

    if (objectToDelete) {
      this.sceneRef.current.remove(objectToDelete);
      this.interactiveObjectsRef.current = this.interactiveObjectsRef.current.filter(
        (obj) => obj.userData.sharedId !== this.actionData.sharedId
      );
      this.originalMaterialsRef.current.delete(objectToDelete);

      if (this.selectedObjectRef.current && this.selectedObjectRef.current.userData.sharedId === this.actionData.sharedId) {
        this.selectedObjectRef.current = null;
        this.setCurrentSelectedObjectForPanelFn(null);
      }

      if (objectToDelete.geometry) objectToDelete.geometry.dispose();
      if (objectToDelete.material) {
        if (Array.isArray(objectToDelete.material)) {
            objectToDelete.material.forEach(mat => mat.dispose());
        } else {
            (objectToDelete.material as THREE.Material).dispose();
        }
      }

      this.socket.emit('request-delete-object', { objectId: this.actionData.sharedId });
      console.log(`[DeleteCommand] Executed for ${this.targetObjectId}`);
    } else {
        console.log(`[DeleteCommand] Execute: Object ${this.targetObjectId} not found for deletion.`);
    }
  }

  undo(): void {
    if (!this.sceneRef.current) return;

    let existingObject = this.interactiveObjectsRef.current.find(obj => obj.userData.sharedId === this.actionData.sharedId);
    if (existingObject) {
        console.log(`[DeleteCommand] Object ${this.actionData.sharedId} already exists during undo. Updating instead of recreating.`);
        existingObject.position.set(this.actionData.position.x, this.actionData.position.y, this.actionData.position.z);
        existingObject.rotation.set(this.actionData.rotation.x, this.actionData.rotation.y, this.actionData.rotation.z, this.actionData.rotation.order);
        existingObject.scale.set(this.actionData.scale.x, this.actionData.scale.y, this.actionData.scale.z);
        if (existingObject.material instanceof THREE.MeshStandardMaterial) {
            existingObject.material.color.setHex(this.actionData.color);
        }
        existingObject.userData.originalColor = new THREE.Color(this.actionData.color);
        existingObject.userData.taskData = {...this.actionData.taskData};
        existingObject.userData.objectType = this.actionData.type;
    } else {
        let newObjectGeometry: THREE.BufferGeometry;
        if (this.actionData.type === 'cube') newObjectGeometry = new THREE.BoxGeometry(1, 1, 1);
        else if (this.actionData.type === 'sphere') newObjectGeometry = new THREE.SphereGeometry(0.75, 32, 32);
        else if (this.actionData.type === 'torus') newObjectGeometry = new THREE.TorusGeometry(0.6, 0.2, 16, 100);
        else return;

        const newObjectMaterial = new THREE.MeshStandardMaterial({ color: this.actionData.color });
        const newObject = new THREE.Mesh(newObjectGeometry, newObjectMaterial);
        newObject.position.set(this.actionData.position.x, this.actionData.position.y, this.actionData.position.z);
        newObject.rotation.set(this.actionData.rotation.x, this.actionData.rotation.y, this.actionData.rotation.z, this.actionData.rotation.order);
        newObject.scale.set(this.actionData.scale.x, this.actionData.scale.y, this.actionData.scale.z);
        newObject.userData.sharedId = this.actionData.sharedId;
        newObject.userData.originalColor = new THREE.Color(this.actionData.color);
        newObject.userData.objectType = this.actionData.type;
        newObject.userData.taskData = {...this.actionData.taskData};

        this.sceneRef.current.add(newObject);
        this.interactiveObjectsRef.current.push(newObject);
        this.originalMaterialsRef.current.set(newObject, newObjectMaterial.clone());
    }

    this.socket.emit('request-create-object', this.actionData);
  }
}

// Debug listeners for Socket.IO client - these are defined at global scope for debugging help
const debugSocketListeners = (socket: Socket) => {
  socket.on("connect", () => {
    console.log("Socket.IO connected successfully:", socket.id);
  });

  socket.on("connect_error", (err: any) => {
    console.error("Socket.IO connect_error:", err);
    console.error(`Connect error message: ${err.message}`);
    if (err.data) {
      console.error("Connect error data:", err.data);
    }
    if (err.description) {
      console.error("Connect error description:", err.description);
    }
    if (err.context) {
      console.error("Connect error context:", err.context);
    }
  });

  socket.on("connect_timeout", (timeout: any) => {
    console.error("Socket.IO connect_timeout:", timeout);
  });

  socket.on("error", (err: any) => {
    console.error("Socket.IO error:", err);
    console.error(`Error message: ${err.message}`);
    if (err.data) {
      console.error("Error data:", err.data);
    }
  });

  socket.on("disconnect", (reason: string, description?: any) => {
    console.warn(`Socket.IO disconnected: ${reason}`);
    if (description) {
      console.warn("Disconnect description:", description);
    }
    if (reason === "io server disconnect") {
      // The disconnection was initiated by the server
    }
  });

  socket.on("reconnect_attempt", (attemptNumber: number) => {
    console.log(`Socket.IO reconnect_attempt: ${attemptNumber}`);
  });

  socket.on("reconnecting", (attemptNumber: number) => {
    console.log(`Socket.IO reconnecting: attempt ${attemptNumber}`);
  });

  socket.on("reconnect_error", (err: any) => {
    console.error("Socket.IO reconnect_error:", err);
    console.error(`Reconnect error message: ${err.message}`);
    if (err.data) {
      console.error("Reconnect error data:", err.data);
    }
  });

  socket.on("reconnect_failed", () => {
    console.error("Socket.IO reconnect_failed");
  });

  socket.on("ping", () => {
    console.log("Socket.IO ping sent by client");
  });

  socket.on("pong", (latency: number) => {
    console.log(`Socket.IO pong received by client: ${latency}ms`);
  });
};


function App() {
  const { authState, initializeSocket: authInitializeSocket } = useAuth(); // Access auth context
  const socketRef = useRef<Socket | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const interactiveObjects = useRef<THREE.Mesh[]>([]);
  const originalMaterials = useRef<Map<THREE.Object3D, THREE.Material | THREE.Material[]>>(new Map());
  const selectedObject = useRef<THREE.Mesh | null>(null);
  const remoteCursorsRef = useRef(new Map<string, THREE.Mesh>());
  const groundPlaneRef = useRef<THREE.Plane>(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const listZonesRef = useRef<ListZone[]>([]);
  const undoStackRef = useRef<Command[]>([]);
  const redoStackRef = useRef<Command[]>([]);
  // Used for future object creation to ensure unique IDs
  // @ts-ignore - Will be used in future implementations
  const nextObjectId = useRef(0);
  const isDraggingRef = useRef(false);
  const dragPlaneRef = useRef<THREE.Plane>(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const intersectionRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const offsetRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const worldPosition = useRef<THREE.Vector3>(new THREE.Vector3());
  const [connectedUsers, setConnectedUsers] = useState<UserData[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Initialize socket with authentication
  const initializeSocket = useCallback(() => {
    if (socketRef.current) {
      console.log('[App:initializeSocket] Socket already exists, reusing existing socket');
      return socketRef.current;
    }

    console.log('[App:initializeSocket] Delegating socket initialization to AuthContext');

    // Use the AuthContext's socket initialization which handles authentication
    const socket = authInitializeSocket();

    if (socket) {
      socketRef.current = socket;
      debugSocketListeners(socket);
      setupSocketAndEvents(); // Set up socket event handlers with authenticated socket
      return socket;
    }

    console.warn('[App:initializeSocket] Socket initialization failed, returning null');
    return null;
  }, [authState.isAuthenticated, authState.user, authInitializeSocket]);

  // Get the socket instance, creating it if needed
  const getSocket = useCallback(() => {
    if (!socketRef.current) {
      console.log('[getSocket] Socket not found, initializing');
      const socket = initializeSocket();
      if (!socket) {
        console.warn('[getSocket] Failed to initialize socket, returning null');
      }
      return socket;
    }
    return socketRef.current;
  }, [initializeSocket]);

  // Initialize socket when the app first loads, even before entering the main view
  useEffect(() => {
    console.log('[Early Socket Init] Initializing socket for authentication');
    // Only initialize if we don't already have a socket
    if (!socketRef.current) {
      initializeSocket();
    }
  }, [initializeSocket]);

  // Initialize socket and events safely
  const setupSocketAndEvents = useCallback(() => {
    const socket = getSocket();
    if (!socket) {
      console.warn('[setupSocketAndEvents] Failed to get socket');
      return;
    }

    console.log('[setupSocketAndEvents] Setting up socket event listeners');

    // Set up socket event listeners only if not already set
    if (!socket.hasListeners('connect')) {
      socket.on('connect', () => {
        console.log('Connected to server with ID:', socket.id);

        // Send user authentication data if available
        if (authState.isAuthenticated && authState.user) {
          console.log('[Socket connect] Sending user authentication data');
          socket.emit('user-authenticated', {
            userId: authState.user.id,
            username: authState.user.username,
            color: authState.user.color || '#' + Math.floor(Math.random()*16777215).toString(16)
          });
        } else {
          console.log('[Socket connect] Connected as guest with socket ID:', socket.id);
        }
      });

      // Setup other socket events
      socket.on('disconnect', () => {
        console.log('Disconnected from server');
      });

      socket.on('server-event', (data) => {
        console.log('Received server-event:', data);
      });

      // More socket event handlers...
      // (Add the rest of your socket event handlers here)
    }

    return socket;
  }, [getSocket, authState.isAuthenticated, authState.user]);
  const [currentSelectedObjectForPanel, setCurrentSelectedObjectForPanel] = useState<THREE.Mesh | null>(null);
  const currentSelectedObjectForPanelRef = useRef<THREE.Object3D | null>(null);
  const initialDragStateRef = useRef<{
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
    taskStatus?: TaskData['status'];
  } | null>(null);

  const [showLandingPage, setShowLandingPage] = useState(true); // State to control landing page visibility
  const [is3DMode, setIs3DMode] = useState(false); // State for 3D mode
  const [forceUpdate, setForceUpdate] = useState(0); // State to force re-render

  const sphereYUpdateAttempted = useRef(false); // To track if Y-update has been attempted

  // Initialize socket when component mounts
  useEffect(() => {
    console.log('[App] Early socket initialization');
    // Initialize socket early, even before the user enters the main app
    const socket = initializeSocket();
    if (socket) {
      // Make the socket available to our socket service
      setSocket(socket);
    }
  }, [initializeSocket]);

  // Handle socket reconnection on authentication state change
  useEffect(() => {
    console.log('[App] Auth state changed, checking if socket needs to be reinitialized');
    if (authState.isAuthenticated && !socketRef.current) {
      console.log('[App] User authenticated but no socket, initializing socket');
      initializeSocket();
    }
  }, [authState.isAuthenticated, initializeSocket]);

  useEffect(() => {
    currentSelectedObjectForPanelRef.current = currentSelectedObjectForPanel;
  }, [currentSelectedObjectForPanel]);

  const animateTaskStatusUpdate = useCallback((objectToAnimate: THREE.Mesh) => {
    if (!objectToAnimate) return;

    const originalY = objectToAnimate.position.y;
    gsap.timeline()
      .to(objectToAnimate.position, { y: originalY + 0.3, duration: 0.15, ease: 'power2.out' })
      .to(objectToAnimate.position, { y: originalY, duration: 0.3, ease: 'bounce.out' });

    if (objectToAnimate.material instanceof THREE.MeshStandardMaterial) {
      const currentMaterial = objectToAnimate.material as THREE.MeshStandardMaterial;

      let finalEmissiveHex = 0x000000; // Default non-selected emissive
      const originalMaterialData = originalMaterials.current.get(objectToAnimate);

      if (originalMaterialData instanceof THREE.MeshStandardMaterial) {
        finalEmissiveHex = originalMaterialData.emissive?.getHex() ?? 0x000000;
      } else if (Array.isArray(originalMaterialData) && originalMaterialData[0] instanceof THREE.MeshStandardMaterial) {
        finalEmissiveHex = originalMaterialData[0].emissive?.getHex() ?? 0x000000;
      }

      if (currentSelectedObjectForPanelRef.current === objectToAnimate) {
        finalEmissiveHex = 0x555500; // Selected emissive
      }

      const flashColor = new THREE.Color(0xFFFF00); // Bright yellow

      // Ensure r, g, b properties exist for GSAP to tween
      if (currentMaterial.emissive.r === undefined) currentMaterial.emissive.r = 0;
      if (currentMaterial.emissive.g === undefined) currentMaterial.emissive.g = 0;
      if (currentMaterial.emissive.b === undefined) currentMaterial.emissive.b = 0;

      const finalColor = new THREE.Color(finalEmissiveHex);

      gsap.timeline()
        .to(currentMaterial.emissive, {
          r: flashColor.r,
          g: flashColor.g,
          b: flashColor.b,
          duration: 0.1,
          ease: 'power1.inOut'
        })
        .to(currentMaterial.emissive, {
          r: finalColor.r,
          g: finalColor.g,
          b: finalColor.b,
          duration: 0.15,
          delay: 0.1,
          ease: 'power1.inOut'
        });
    }
  }, []); // Depends on refs: currentSelectedObjectForPanelRef, originalMaterials

  const updateUndoRedoState = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  const recordAndExecuteCommand = useCallback((command: Command) => {
    try {
      console.log(`[recordAndExecuteCommand] Executing command: ${command.description}`);
      command.execute();

      // Add to undo stack
      undoStackRef.current.push(command);
      redoStackRef.current = [];
      updateUndoRedoState();

      // Refresh PropertiesPanel if the command affected the selected object
      let objectIdForRefresh: string | undefined = undefined;
      if (command.actionType === 'updateTaskProperty' && command.actionData) {
        objectIdForRefresh = (command.actionData as UpdateTaskPropertyCommandData).objectId;
      } else if (command.actionType === 'moveObject' && command.actionData) {
        objectIdForRefresh = (command.actionData as MoveObjectCommandData).objectId;
      } else if (command.actionType === 'createObject' && command.actionData) {
        objectIdForRefresh = (command.actionData as CreateObjectCommandData).sharedId;
      } else if (command.actionType === 'deleteObject' && command.actionData) {
        objectIdForRefresh = (command.actionData as DeleteObjectCommandData).sharedId;
      }

      if (objectIdForRefresh && currentSelectedObjectForPanelRef.current && currentSelectedObjectForPanelRef.current.userData.sharedId === objectIdForRefresh) {
        const updatedObject = interactiveObjects.current.find(obj => obj.userData.sharedId === objectIdForRefresh);
        if (updatedObject) {
          console.log(`[recordAndExecuteCommand] Refreshing panel for object: ${objectIdForRefresh}`);
          setCurrentSelectedObjectForPanel(null); // Force re-selection to trigger panel update
          setTimeout(() => {
            setCurrentSelectedObjectForPanel(updatedObject);
          }, 10); // Small delay to ensure state updates properly
        }
      }
      console.log(`[Undo] Executed & Recorded: ${command.description}. Undo: ${undoStackRef.current.length}, Redo: ${redoStackRef.current.length}`);
    } catch (error) {
      console.error(`[recordAndExecuteCommand] Error executing command:`, error);
    }
  }, [updateUndoRedoState]);

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length > 0) {
      try {
        const command = undoStackRef.current.pop()!;
        console.log(`[handleUndo] Undoing command: ${command.description}`);

        // Execute the undo operation
        command.undo();

        // Add to redo stack
        redoStackRef.current.push(command);
        updateUndoRedoState();

        // Determine which object needs to be refreshed
        let objectIdForRefresh: string | undefined = undefined;
        if (command.actionType === 'updateTaskProperty' && command.actionData) {
          objectIdForRefresh = (command.actionData as UpdateTaskPropertyCommandData).objectId;
        } else if (command.actionType === 'moveObject' && command.actionData) {
          objectIdForRefresh = (command.actionData as MoveObjectCommandData).objectId;
        } else if (command.actionType === 'createObject' && command.actionData) {
          objectIdForRefresh = (command.actionData as CreateObjectCommandData).sharedId;
        } else if (command.actionType === 'deleteObject' && command.actionData) {
          objectIdForRefresh = (command.actionData as DeleteObjectCommandData).sharedId;
        }

        if (objectIdForRefresh) {
          console.log(`[handleUndo] Object ID for refresh: ${objectIdForRefresh}`);

          // Find the object that was affected
          const updatedObject = interactiveObjects.current.find(obj => obj.userData.sharedId === objectIdForRefresh);

          if (updatedObject) {
            console.log('[handleUndo] Object found after undo:',
              updatedObject.userData.sharedId,
              'Position:', updatedObject.position.toArray(),
              'TaskData:', JSON.stringify(updatedObject.userData.taskData));

            // Force a render update by triggering a small animation
            // This ensures Three.js updates the scene with the new position
            gsap.fromTo(updatedObject.scale,
              { x: updatedObject.scale.x * 1.1, y: updatedObject.scale.y * 1.1, z: updatedObject.scale.z * 1.1 },
              { x: updatedObject.scale.x, y: updatedObject.scale.y, z: updatedObject.scale.z, duration: 0.2, ease: "power2.out" }
            );

            // If this is the currently selected object, refresh the panel
            if (currentSelectedObjectForPanelRef.current &&
                currentSelectedObjectForPanelRef.current.userData.sharedId === objectIdForRefresh) {

              console.log('[handleUndo] Refreshing panel for object:', updatedObject.userData.sharedId);

              // Reset and then set the selected object to force a refresh
              setCurrentSelectedObjectForPanel(null);

              // Use a small delay to ensure the state updates properly
              setTimeout(() => {
                setCurrentSelectedObjectForPanel(updatedObject);
              }, 50);
            }
          } else {
            console.log('[handleUndo] Object no longer exists after undo, clearing panel');
            setCurrentSelectedObjectForPanel(null);
          }
        }

        // Force a re-render of the scene by triggering a state update
        setForceUpdate(Math.random());

        console.log(`[Undo] Undone: ${command.description}. Undo: ${undoStackRef.current.length}, Redo: ${redoStackRef.current.length}`);
      } catch (error) {
        console.error(`[handleUndo] Error undoing command:`, error);
      }
    }
  }, [updateUndoRedoState, setForceUpdate]);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length > 0) {
      try {
        const command = redoStackRef.current.pop()!;
        console.log(`[handleRedo] Redoing command: ${command.description}`);

        // Execute the redo operation
        command.execute();

        // Add to undo stack
        undoStackRef.current.push(command);
        updateUndoRedoState();

        // Determine which object needs to be refreshed
        let objectIdForRefresh: string | undefined = undefined;
        if (command.actionType === 'updateTaskProperty' && command.actionData) {
          objectIdForRefresh = (command.actionData as UpdateTaskPropertyCommandData).objectId;
        } else if (command.actionType === 'moveObject' && command.actionData) {
          objectIdForRefresh = (command.actionData as MoveObjectCommandData).objectId;
        } else if (command.actionType === 'createObject' && command.actionData) {
          objectIdForRefresh = (command.actionData as CreateObjectCommandData).sharedId;
        } else if (command.actionType === 'deleteObject' && command.actionData) {
          objectIdForRefresh = (command.actionData as DeleteObjectCommandData).sharedId;
        }

        if (objectIdForRefresh) {
          console.log(`[handleRedo] Object ID for refresh: ${objectIdForRefresh}`);

          // Find the object that was affected
          const updatedObject = interactiveObjects.current.find(obj => obj.userData.sharedId === objectIdForRefresh);

          if (updatedObject) {
            console.log('[handleRedo] Object found after redo:',
              updatedObject.userData.sharedId,
              'Position:', updatedObject.position.toArray(),
              'TaskData:', JSON.stringify(updatedObject.userData.taskData));

            // Force a render update by triggering a small animation
            // This ensures Three.js updates the scene with the new position
            gsap.fromTo(updatedObject.scale,
              { x: updatedObject.scale.x * 1.1, y: updatedObject.scale.y * 1.1, z: updatedObject.scale.z * 1.1 },
              { x: updatedObject.scale.x, y: updatedObject.scale.y, z: updatedObject.scale.z, duration: 0.2, ease: "power2.out" }
            );

            // If this is the currently selected object, refresh the panel
            if (currentSelectedObjectForPanelRef.current &&
                currentSelectedObjectForPanelRef.current.userData.sharedId === objectIdForRefresh) {

              console.log('[handleRedo] Refreshing panel for object:', updatedObject.userData.sharedId);

              // Reset and then set the selected object to force a refresh
              setCurrentSelectedObjectForPanel(null);

              // Use a small delay to ensure the state updates properly
              setTimeout(() => {
                setCurrentSelectedObjectForPanel(updatedObject);
              }, 50);
            }
          } else {
            console.log('[handleRedo] Object no longer exists after redo, clearing panel');
            setCurrentSelectedObjectForPanel(null);
          }
        }

        // Force a re-render of the scene by triggering a state update
        setForceUpdate(Math.random());

        console.log(`[Redo] Redone: ${command.description}. Undo: ${undoStackRef.current.length}, Redo: ${redoStackRef.current.length}`);
      } catch (error) {
        console.error(`[handleRedo] Error redoing command:`, error);
      }
    }
  }, [updateUndoRedoState, setForceUpdate]);

  const handlePropertyUpdateFromPanel = useCallback((
    objectId: string,
    property: 'taskTitle' | 'taskDescription' | 'taskChecklistUpdate' | 'taskStatus',
    value: string | ChecklistUpdateAction,
    oldValue: string | ChecklistItem[]
  ) => {
    console.log(`[handlePropertyUpdateFromPanel] Updating ${property} for ${objectId}:`, value);

    const object = interactiveObjects.current.find(obj => obj.userData.sharedId === objectId);
    if (!object) {
      console.error(`[handlePropertyUpdateFromPanel] Object not found: ${objectId}`);
      return;
    }

    const commandData: UpdateTaskPropertyCommandData = {
      objectId,
      property,
      value,
      oldValue,
      userId: getSocket()?.id || 'system',
    };

    const socket = getSocket();
    if (!socket) {
      console.error('Cannot update property: socket not initialized');
      return;
    }

    const description = `Update ${property} for ${objectId}`;
    const command = new UpdateTaskPropertyCommandImpl(
      interactiveObjects,
      socket,
      commandData,
      description
    );

    // If this is a status update, also update the object's position to match the new zone
    if (property === 'taskStatus' && typeof value === 'string') {
      const newStatus = value as 'To Do' | 'In Progress' | 'Done';
      const targetZone = listZonesRef.current.find(zone => zone.name === newStatus);

      if (targetZone && targetZone.mesh) {
        console.log(`[handlePropertyUpdateFromPanel] Moving object to ${newStatus} zone`);

        // Store original position for potential undo
        const originalPosition = object.position.clone();

        // Calculate new position with random offset for natural placement
        const newPosition = new THREE.Vector3(
          targetZone.position.x + (Math.random() - 0.5) * targetZone.size.width * 0.8,
          object.position.y, // Keep the same height
          targetZone.position.z + (Math.random() - 0.5) * targetZone.size.depth * 0.8
        );

        // Update object's userData with the new status immediately
        if (!object.userData.taskData) {
          object.userData.taskData = {
            title: 'New Task',
            description: '',
            status: newStatus,
            checklist: [],
            activityLog: []
          };
        } else {
          object.userData.taskData.status = newStatus;
        }

        // Create a more elaborate animation sequence
        const timeline = gsap.timeline();

        // First, slight bounce up
        timeline.to(object.position, {
          y: object.position.y + 0.3,
          duration: 0.2,
          ease: 'power2.out'
        });

        // Then move to new position
        timeline.to(object.position, {
          x: newPosition.x,
          z: newPosition.z,
          duration: 0.5,
          ease: 'power3.inOut'
        }, "-=0.1");

        // Finally, bounce down to settle
        timeline.to(object.position, {
          y: originalPosition.y,
          duration: 0.3,
          ease: 'bounce.out'
        }, "-=0.2");

        // Add a rotation effect
        gsap.to(object.rotation, {
          y: object.rotation.y + Math.PI * 2,
          duration: 0.7,
          ease: 'power2.inOut'
        });

        // Add a scale effect
        gsap.to(object.scale, {
          x: object.scale.x * 1.2,
          y: object.scale.y * 1.2,
          z: object.scale.z * 1.2,
          duration: 0.2,
          yoyo: true,
          repeat: 1,
          ease: 'power2.inOut'
        });

        // Emit position update to other clients
        socket.emit('object-moved', {
          objectId: objectId,
          position: {
            x: newPosition.x,
            y: object.position.y,
            z: newPosition.z
          },
          rotation: {
            x: object.rotation.x,
            y: object.rotation.y,
            z: object.rotation.z,
            order: object.rotation.order
          },
          scale: {
            x: object.scale.x,
            y: object.scale.y,
            z: object.scale.z
          },
          taskStatus: newStatus,
          userId: socket.id
        });

        // Add activity log entry for the status change
        if (object.userData.taskData && !object.userData.taskData.activityLog) {
          object.userData.taskData.activityLog = [];
        }

        if (object.userData.taskData && object.userData.taskData.activityLog) {
          object.userData.taskData.activityLog.push({
            timestamp: new Date().toISOString(),
            userId: socket.id || 'system',
            action: 'Status Changed via Panel',
            details: `Status changed to '${newStatus}'`
          });
        }
      }
    }

    recordAndExecuteCommand(command);
  }, [recordAndExecuteCommand, getSocket]); // Added getSocket to dependencies

  // Handler to switch from LandingPage to the main app
  const handleEnterApp = () => {
    setShowLandingPage(false);
  };

  useEffect(() => {
    console.log('[Main Effect] Running. showLandingPage state:', showLandingPage);
    console.log('[Main Effect] mountRef.current:', mountRef.current);
    console.log('[Main Effect] is3DMode state:', is3DMode);
    console.log('[Main Effect] forceUpdate state:', forceUpdate);

    if (showLandingPage || is3DMode) {
      console.log('[Main Effect] Exiting early because showLandingPage is true or is3DMode is true.');
      return; // Exit if landing page is active or in 3D mode
    }

    if (!mountRef.current) {
      console.error('[Main Effect] CRITICAL: Exiting because mountRef.current is null or undefined AFTER landing page check. The 3D scene cannot be mounted.');
      return; // Exit if the mount point is not available
    }

    let setupAttempted = false;

    try {
      console.log('[Main Effect] Attempting Three.js scene setup, event listeners, and socket handlers.');
      setupAttempted = true;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xeeeeee);
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
      cameraRef.current = camera;
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      rendererRef.current = renderer;
      renderer.setSize(window.innerWidth, window.innerHeight);
      mountRef.current.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.screenSpacePanning = false;
      controls.minDistance = 2;
      controls.maxDistance = 10;
      controls.enabled = true; // Make sure controls are enabled by default

      interactiveObjects.current = [];
      originalMaterials.current = new Map<THREE.Object3D, THREE.Material | THREE.Material[]>();
      remoteCursorsRef.current = new Map<string, THREE.Mesh>();
      listZonesRef.current = [
        { name: 'To Do', position: new THREE.Vector3(-4, 0.01, 0), size: { width: 3, depth: 4 }, color: new THREE.Color(0xff6347) /* Tomato */ },
        { name: 'In Progress', position: new THREE.Vector3(0, 0.01, 0), size: { width: 3, depth: 4 }, color: new THREE.Color(0xffd700) /* Gold */ },
        { name: 'Done', position: new THREE.Vector3(4, 0.01, 0), size: { width: 3, depth: 4 }, color: new THREE.Color(0x90ee90) /* LightGreen */ },
      ];

      listZonesRef.current.forEach(zoneData => {
        const zoneGeometry = new THREE.PlaneGeometry(zoneData.size.width, zoneData.size.depth);
        const zoneMaterial = new THREE.MeshStandardMaterial({ color: zoneData.color, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
        const zoneMesh = new THREE.Mesh(zoneGeometry, zoneMaterial);
        zoneMesh.position.copy(zoneData.position);
        zoneMesh.rotation.x = -Math.PI / 2; // Rotate to lay flat on XZ plane
        scene.add(zoneMesh);
        zoneData.mesh = zoneMesh; // Store mesh reference
      });

      const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
      const cubeMaterial = new THREE.MeshStandardMaterial({ color: 0x007bff, name: 'cubeMaterial' });
      const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
      cube.position.x = -2;
      cube.userData.originalColor = new THREE.Color(0x007bff);
      cube.userData.sharedId = 'shared_cube';
      cube.userData.objectType = 'cube'; // Assuming objectType might be useful
      cube.userData.taskData = {
        title: 'Cube Task',
        description: 'Default description for cube task.',
        status: 'To Do',
        checklist: [],
        activityLog: [{
          timestamp: new Date().toISOString(),
          userId: 'system',
          action: 'Task Created',
          details: 'Task initialized for shared_cube'
        }]
      };
      scene.add(cube);
      interactiveObjects.current.push(cube);
      originalMaterials.current.set(cube, cubeMaterial.clone());

      const sphereGeometry = new THREE.SphereGeometry(0.75, 32, 32);
      const sphereMaterial = new THREE.MeshStandardMaterial({ color: 0xff4500, name: 'sphereMaterial' });
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      sphere.position.x = 0;
      sphere.userData.originalColor = new THREE.Color(0xff4500);
      sphere.userData.sharedId = 'shared_sphere';
      sphere.userData.objectType = 'sphere';
      sphere.userData.taskData = {
        title: 'Sphere Task',
        description: 'Default description for sphere task.',
        status: 'To Do',
        checklist: [],
        activityLog: [{
          timestamp: new Date().toISOString(),
          userId: 'system',
          action: 'Task Created',
          details: 'Task initialized for shared_sphere'
        }]
      };
      scene.add(sphere);
      interactiveObjects.current.push(sphere);
      originalMaterials.current.set(sphere, sphereMaterial.clone());

      const torusGeometry = new THREE.TorusGeometry(0.6, 0.2, 16, 100);
      const torusMaterial = new THREE.MeshStandardMaterial({ color: 0x28a745, name: 'torusMaterial' });
      const torus = new THREE.Mesh(torusGeometry, torusMaterial);
      torus.position.x = 2;
      torus.userData.originalColor = new THREE.Color(0x28a745);
      torus.userData.sharedId = 'shared_torus';
      torus.userData.objectType = 'torus';
      torus.userData.taskData = {
        title: 'Torus Task',
        description: 'Default description for torus task.',
        status: 'To Do',
        checklist: [],
        activityLog: [{
          timestamp: new Date().toISOString(),
          userId: 'system',
          action: 'Task Created',
          details: 'Task initialized for shared_torus'
        }]
      };
      scene.add(torus);
      interactiveObjects.current.push(torus);
      originalMaterials.current.set(torus, torusMaterial.clone());

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      scene.add(ambientLight);
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(5, 10, 7.5);
      scene.add(directionalLight);
      camera.position.z = 5;

      gsap.to(cube.rotation, { y: Math.PI * 2, duration: 7, repeat: -1, ease: 'linear' });
      gsap.to(sphere.rotation, { y: -Math.PI * 2, duration: 10, repeat: -1, ease: 'linear' });
      gsap.to(torus.rotation, { x: Math.PI * 2, duration: 8, repeat: -1, ease: 'linear' });

      // Additional GSAP animations:

      // For cube: color change (animating r, g, b properties of the THREE.Color object)
      // This assumes cube.material.color is a THREE.Color object, which it is for MeshStandardMaterial
      if (cube && cube.material && (cube.material as THREE.MeshStandardMaterial).color) {
        gsap.to((cube.material as THREE.MeshStandardMaterial).color, {
          r: 1, // Target red
          g: 0.2, // A bit of green
          b: 0.2, // A bit of blue -> resulting in a reddish hue
          duration: 3,
          repeat: -1,
          yoyo: true,
          ease: 'power1.inOut'
        });
      }

      // For sphere: add rotation around X-axis to complement existing Y-axis rotation
      if (sphere) {
        gsap.to(sphere.rotation, {
          x: Math.PI * 2,
          duration: 12,
          repeat: -1,
          ease: 'linear',
          delay: 0.5 // Stagger with Y rotation
        });
      }

      // For torus: make its emissive property pulse
      if (torus && torus.material instanceof THREE.MeshStandardMaterial) {
        const torusStandardMaterial = torus.material as THREE.MeshStandardMaterial;
        // Ensure emissive property exists and is a THREE.Color
        if (!torusStandardMaterial.emissive) {
          torusStandardMaterial.emissive = new THREE.Color(0x000000);
        }
        // Define a target emissive color (e.g., a fraction of its diffuse color)
        const targetEmissiveColor = new THREE.Color(torusStandardMaterial.color).multiplyScalar(0.4);

        gsap.to(torusStandardMaterial.emissive, {
          r: targetEmissiveColor.r,
          g: targetEmissiveColor.g,
          b: targetEmissiveColor.b,
          duration: 2.0,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut'
        });
      }

      const socket = getSocket();

      if (!socket) {
        console.error('Failed to initialize socket. Cannot set up event listeners.');
        return;
      }

      socket.on('connect', () => {
        console.log('Connected to server with ID:', socket.id);

        // Send user information if authenticated
        if (authState.isAuthenticated && authState.user) {
          socket.emit('user-authenticated', {
            id: authState.user.id,
            username: authState.user.username,
            color: authState.user.color || '#' + Math.floor(Math.random()*16777215).toString(16)
          });
          console.log('[Socket connect] Emitted user-authenticated event with user data:', authState.user.username);
        } else {
          console.log('[Socket connect] Connected as guest with socket ID:', socket.id);
        }
      });

      socket.on('disconnect', () => {
        console.log('Disconnected from server');
      });

      socket.on('server-event', (data) => {
        console.log('Received server-event:', data);
      });

      // Add cursor-move event handler
      socket.on('cursor-move', (data: { userId: string; x: number; y: number }) => {
        if (data.userId === socket.id) return; // Don't process your own cursor

        // Get user color from connected users
        const userColor = connectedUsers.find(u => u.id === data.userId)?.color || '#ff0000';

        // Create or update remote cursor
        if (!remoteCursorsRef.current.has(data.userId)) {
          // Create a more visible cursor with combined shapes
          const cursorGroup = new THREE.Group();

          // Create cone for cursor pointer
          const cursorGeometry = new THREE.ConeGeometry(0.06, 0.2, 8);
          const cursorMaterial = new THREE.MeshStandardMaterial({
            color: userColor,
            emissive: new THREE.Color(userColor).multiplyScalar(0.4),
            emissiveIntensity: 0.7
          });
          const cone = new THREE.Mesh(cursorGeometry, cursorMaterial);
          cone.rotation.x = Math.PI; // Point downward
          cursorGroup.add(cone);

          // Add small sphere at top for better visibility
          const sphereGeometry = new THREE.SphereGeometry(0.04, 16, 16);
          const sphereMaterial = new THREE.MeshStandardMaterial({
            color: '#ffffff',
            emissive: new THREE.Color(userColor),
            emissiveIntensity: 0.5
          });
          const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
          sphere.position.y = 0.12; // Position at tip of cone
          cursorGroup.add(sphere);

          cursorGroup.name = `cursor-${data.userId}`;

          // Add to scene and store in map
          if (sceneRef.current) {
            sceneRef.current.add(cursorGroup);
            remoteCursorsRef.current.set(data.userId, cursorGroup as unknown as THREE.Mesh);
            console.log(`Created enhanced cursor for ${data.userId}`);
          }
        }

        // Update cursor position based on raycasting
        if (cameraRef.current && remoteCursorsRef.current.has(data.userId)) {
          const cursor = remoteCursorsRef.current.get(data.userId);
          if (cursor) {
            // Convert screen coordinates to normalized device coordinates
            const mouseX = (data.x / window.innerWidth) * 2 - 1;
            const mouseY = -(data.y / window.innerHeight) * 2 + 1;

            // Create a raycaster
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), cameraRef.current);

            // Create a plane at y=0 for cursor positioning
            const cursorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const intersection = new THREE.Vector3();

            // Find intersection with the plane
            if (raycaster.ray.intersectPlane(cursorPlane, intersection)) {
              // Use GSAP for smooth cursor movement
              gsap.to(cursor.position, {
                x: intersection.x,
                y: intersection.y + 0.15, // Slight lift for better visibility
                z: intersection.z,
                duration: 0.2,
                ease: 'power2.out'
              });

              // Make cursor "pulse" slightly when it moves
              gsap.to(cursor.scale, {
                x: 1.2, y: 1.2, z: 1.2,
                duration: 0.1,
                yoyo: true,
                repeat: 1,
                ease: 'power1.inOut'
              });
            }
          }
        }
      });

      socket.on('user-list-updated', (incomingUsers: UserData[]) => {
        console.log('Received user-list-updated:', incomingUsers);

        const validUsers = incomingUsers
          .filter(user => user && typeof user.id === 'string' && user.id.trim() !== '')
          .map(user => ({
            ...user,
            color: (typeof user.color === 'string' && user.color.trim() !== '') ? user.color : '#CCCCCC',
          }));

        setConnectedUsers(validUsers);

        if (!sceneRef.current) return;

        const currentRemoteUserIds = new Set(remoteCursorsRef.current.keys());
        const validUserIdsFromServer = new Set(validUsers.map(u => u.id));

        validUsers.forEach(user => {
          if (user.id === socket.id) return;

          let cursorMesh = remoteCursorsRef.current.get(user.id);
          if (!cursorMesh) {
            // Create a more visible cursor with combined shapes
            const cursorGroup = new THREE.Group();

            // Create cone for cursor pointer
            const cursorGeometry = new THREE.ConeGeometry(0.06, 0.2, 8);
            const cursorMaterial = new THREE.MeshStandardMaterial({
              color: user.color,
              emissive: new THREE.Color(user.color).multiplyScalar(0.4),
              emissiveIntensity: 0.7
            });
            const cone = new THREE.Mesh(cursorGeometry, cursorMaterial);
            cone.rotation.x = Math.PI; // Point downward
            cursorGroup.add(cone);

            // Add small sphere at top for better visibility
            const sphereGeometry = new THREE.SphereGeometry(0.04, 16, 16);
            const sphereMaterial = new THREE.MeshStandardMaterial({
              color: '#ffffff',
              emissive: new THREE.Color(user.color),
              emissiveIntensity: 0.5
            });
            const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
            sphere.position.y = 0.12; // Position at tip of cone
            cursorGroup.add(sphere);

            cursorGroup.name = `cursor-${user.id}`;
            sceneRef.current?.add(cursorGroup);
            remoteCursorsRef.current.set(user.id, cursorGroup as unknown as THREE.Mesh);
            console.log(`[Client ${socket.id?.substring(0,5)}] Created enhanced cursor for ${user.id}`);
          } else {
            if (cursorMesh.children.length > 0) {
              // Update both cone and sphere colors
              cursorMesh.children.forEach(child => {
                if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
                  if (child.geometry instanceof THREE.ConeGeometry) {
                    child.material.color.set(user.color);
                    child.material.emissive.set(new THREE.Color(user.color).multiplyScalar(0.4));
                  } else if (child.geometry instanceof THREE.SphereGeometry) {
                    child.material.emissive.set(new THREE.Color(user.color));
                  }
                }
              });
            } else if (cursorMesh.material instanceof THREE.MeshStandardMaterial) {
              cursorMesh.material.color.set(user.color);
            }
          }
        });

        currentRemoteUserIds.forEach(userId => {
          if (!validUserIdsFromServer.has(userId)) {
            const cursorToRemove = remoteCursorsRef.current.get(userId);
            if (cursorToRemove) {
              sceneRef.current?.remove(cursorToRemove);
              cursorToRemove.geometry.dispose();
              if (cursorToRemove.material instanceof THREE.Material) {
                cursorToRemove.material.dispose();
              }
              remoteCursorsRef.current.delete(userId);
              console.log(`[Client ${socket.id?.substring(0,5)}] Removed cursor for ${userId}`);
            }
          }
        });
      });

      socket.on('object-updated', (data: {
        objectId: string,
        position: { x: number, y: number, z: number },
        rotation: { x: number, y: number, z: number, order?: THREE.EulerOrder },
        scale: { x: number; y: number; z: number },
        taskStatus?: TaskData['status'],
        activityLogEntry?: ActivityLogEntry,
        userId?: string
      }) => {
        console.log(`[Socket object-updated] Received update for ${data.objectId}:`, data);
        const objectToUpdate = interactiveObjects.current.find(obj => obj.userData.sharedId === data.objectId);
        if (!objectToUpdate) {
          console.warn(`[Socket object-updated] Object with ID ${data.objectId} not found locally.`);
          return;
        }

        // Only update if we're not currently dragging this object
        if (objectToUpdate.userData.sharedId !== selectedObject.current?.userData.sharedId || !isDraggingRef.current) {
          // Update position, rotation, and scale
          objectToUpdate.position.set(data.position.x, data.position.y, data.position.z);
          objectToUpdate.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z, data.rotation.order || 'XYZ');
          if (data.scale) {
            gsap.to(objectToUpdate.scale, {
              x: data.scale.x, y: data.scale.y, z: data.scale.z, duration: 0.2, ease: 'power2.out'
            });
          }

          // Update task status if provided
          if (data.taskStatus && objectToUpdate.userData.taskData) {
            const oldStatus = objectToUpdate.userData.taskData.status;
            if (oldStatus !== data.taskStatus) {
              console.log(`[Socket object-updated] Updating task status from ${oldStatus} to ${data.taskStatus}`);
              objectToUpdate.userData.taskData.status = data.taskStatus;

              // Animate the status change
              animateTaskStatusUpdate(objectToUpdate);

              // Add to activity log if not already included
              if (data.activityLogEntry && objectToUpdate.userData.taskData.activityLog) {
                const logExists = objectToUpdate.userData.taskData.activityLog.some((entry: ActivityLogEntry) =>
                  entry.timestamp === data.activityLogEntry!.timestamp &&
                  entry.userId === data.activityLogEntry!.userId
                );

                if (!logExists) {
                  objectToUpdate.userData.taskData.activityLog.push(data.activityLogEntry);
                }
              } else if (data.userId && objectToUpdate.userData.taskData.activityLog) {
                objectToUpdate.userData.taskData.activityLog.push({
                  timestamp: new Date().toISOString(),
                  userId: data.userId,
                  action: 'Status Changed (remote)',
                  details: `Status changed from ${oldStatus} to ${data.taskStatus}`
                });
              }
            }
          }

          // Update panel if this is the currently selected object
          if (currentSelectedObjectForPanelRef.current === objectToUpdate) {
            setCurrentSelectedObjectForPanel(null);
            setCurrentSelectedObjectForPanel(objectToUpdate);
          }
        }
      });

      socket.on('object-created', (data: CreateObjectCommandData) => {
        if (!sceneRef.current) return;

        const existingObject = interactiveObjects.current.find(obj => obj.userData.sharedId === data.sharedId);
        if (existingObject) {
            console.warn(`[Socket object-created] Object with sharedId ${data.sharedId} already exists. Ignoring.`);
            return;
        }

        let newObjectGeometry: THREE.BufferGeometry;
        if (data.type === 'cube') newObjectGeometry = new THREE.BoxGeometry(1, 1, 1);
        else if (data.type === 'sphere') newObjectGeometry = new THREE.SphereGeometry(0.75, 32, 32);
        else if (data.type === 'torus') newObjectGeometry = new THREE.TorusGeometry(0.6, 0.2, 16, 100);
        else return;
        const newObjectMaterial = new THREE.MeshStandardMaterial({ color: data.color });
        const newObject = new THREE.Mesh(newObjectGeometry, newObjectMaterial);
        newObject.position.set(data.position.x, data.position.y, data.position.z);
        newObject.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z, data.rotation.order);
        newObject.scale.set(data.scale.x, data.scale.y, data.scale.z);
        newObject.userData.sharedId = data.sharedId;
        newObject.userData.originalColor = new THREE.Color(data.color);
        newObject.userData.objectType = data.type;
        newObject.userData.taskData = {
          ...data.taskData,
          activityLog: data.taskData.activityLog ? [...data.taskData.activityLog] : []
        };

        sceneRef.current.add(newObject);
        interactiveObjects.current.push(newObject);
        originalMaterials.current.set(newObject, newObjectMaterial.clone());
      });

      socket.on('object-deleted', (data: { objectId: string }) => {
        if (!sceneRef.current) return;
        const objectToDelete = interactiveObjects.current.find(obj => obj.userData.sharedId === data.objectId);
        if (objectToDelete) {
          console.log(`[Socket object-deleted] Received delete for ${data.objectId}`);
          sceneRef.current.remove(objectToDelete);

          if (objectToDelete.geometry) objectToDelete.geometry.dispose();
          if (objectToDelete.material) {
              if (Array.isArray(objectToDelete.material)) {
                  objectToDelete.material.forEach(mat => mat.dispose());
              } else {
                  (objectToDelete.material as THREE.Material).dispose();
              }
          }

          interactiveObjects.current = interactiveObjects.current.filter(obj => obj.userData.sharedId !== data.objectId);
          originalMaterials.current.delete(objectToDelete);
          if (selectedObject.current && selectedObject.current.userData.sharedId === data.objectId) {
            selectedObject.current = null;
          }
        }
      });

      socket.on('object-property-updated', (data: ObjectPropertyUpdateData & { fullTaskData?: TaskData }) => {
        console.log('[Socket object-property-updated] Received data:', JSON.stringify(data, null, 2));

        const objectToUpdate = interactiveObjects.current.find(obj => obj.userData.sharedId === data.objectId);
        if (objectToUpdate) {
          console.log(`[Socket object-property-updated] Found object ${data.objectId}. Current taskData BEFORE update:`, JSON.stringify(objectToUpdate.userData.taskData, null, 2));
          let panelNeedsRefresh = false;

          // If we received full task data, use it for complete synchronization
          if (data.fullTaskData && typeof data.fullTaskData === 'object') {
            console.log(`[Socket object-property-updated] Received full taskData, applying complete update`);
            objectToUpdate.userData.taskData = { ...data.fullTaskData };
            panelNeedsRefresh = true;
          } else {
            // Otherwise, update individual properties
            const taskData = objectToUpdate.userData.taskData as TaskData | undefined;

            if (taskData && !taskData.activityLog) {
              taskData.activityLog = [];
            }
            if (data.activityLogEntry) {
              console.log(`[Socket object-property-updated] Received activityLogEntry:`, JSON.stringify(data.activityLogEntry, null, 2));
            }

            if (data.property === 'color' && typeof data.value === 'string' && objectToUpdate.material instanceof THREE.MeshStandardMaterial) {
              objectToUpdate.material.color.set(data.value);
              objectToUpdate.userData.originalColor = new THREE.Color(data.value);
              panelNeedsRefresh = true;
              if (taskData && data.userId && data.activityLogEntry) {
                const logExists = taskData.activityLog.some(entry => entry.timestamp === data.activityLogEntry!.timestamp && entry.userId === data.activityLogEntry!.userId && entry.action === data.activityLogEntry!.action);
                if (!logExists) {
                  taskData.activityLog.push(data.activityLogEntry);
                  console.log(`[Socket object-property-updated] Pushed received activityLogEntry for color update.`);
                } else {
                  console.log(`[Socket object-property-updated] Skipped pushing duplicate activityLogEntry for color update.`);
                }
              } else if (taskData && data.userId) {
                taskData.activityLog.push({
                  timestamp: new Date().toISOString(),
                  userId: data.userId,
                  action: 'Color updated (remote)',
                  details: `Color changed to ${data.value}`
                });
                console.log(`[Socket object-property-updated] Pushed generated activityLogEntry for remote color update.`);
              }
            } else if (data.property === 'scale' && typeof data.value === 'object' && data.value !== null && 'x' in data.value && 'y' in data.value && 'z' in data.value) {
              objectToUpdate.scale.set(data.value.x, data.value.y, data.value.z);
              panelNeedsRefresh = true;
              if (taskData && data.userId && data.activityLogEntry) {
                const logExists = taskData.activityLog.some(entry => entry.timestamp === data.activityLogEntry!.timestamp && entry.userId === data.activityLogEntry!.userId && entry.action === data.activityLogEntry!.action);
                if (!logExists) {
                  taskData.activityLog.push(data.activityLogEntry);
                  console.log(`[Socket object-property-updated] Pushed received activityLogEntry for scale update.`);
                } else {
                  console.log(`[Socket object-property-updated] Skipped pushing duplicate activityLogEntry for scale update.`);
                }
              } else if (taskData && data.userId) {
                taskData.activityLog.push({
                  timestamp: new Date().toISOString(),
                  userId: data.userId,
                  action: 'Scale updated (remote)',
                  details: `Scale changed to X:${data.value.x}, Y:${data.value.y}, Z:${data.value.z}`
                });
                console.log(`[Socket object-property-updated] Pushed generated activityLogEntry for remote scale update.`);
              }
            } else if (taskData && data.property === 'taskTitle' && typeof data.value === 'string') {
              const oldTitle = taskData.title;
              taskData.title = data.value;
              console.log(`[Socket object-property-updated] Task title updated for ${data.objectId}. Old: "${oldTitle}", New: "${taskData.title}"`);
              panelNeedsRefresh = true;
              if (data.userId && data.activityLogEntry) {
                const logExists = taskData.activityLog.some(entry =>
                    entry.timestamp === data.activityLogEntry!.timestamp && entry.userId === data.activityLogEntry!.userId && entry.action === data.activityLogEntry!.action
                );
                if (!logExists) {
                    taskData.activityLog.push(data.activityLogEntry);
                    console.log(`[Socket object-property-updated] Pushed received activityLogEntry for title update.`);
                } else {
                    console.log(`[Socket object-property-updated] Skipped pushing duplicate activityLogEntry for title update.`);
                }
              } else if (data.userId) {
                  taskData.activityLog.push({
                    timestamp: new Date().toISOString(),
                    userId: data.userId,
                    action: 'Task title updated (remote)',
                    details: `Title changed from "${oldTitle}" to "${data.value}"`
                  });
                  console.log(`[Socket object-property-updated] Pushed generated activityLogEntry for remote title update.`);
              }
            } else if (taskData && data.property === 'taskDescription' && typeof data.value === 'string') {
              // const oldDescription = taskData.description; // Commented out as it's unused
              taskData.description = data.value;
              console.log(`[Socket object-property-updated] Task description updated for ${data.objectId}.`);
              panelNeedsRefresh = true;
            } else if (taskData && data.property === 'taskStatus' && typeof data.value === 'string') {
              const oldStatus = taskData.status;
              const newStatus = data.value as TaskData['status'];
              console.log(`[Socket object-property-updated] Task status update for ${data.objectId}. Old: "${oldStatus}", Attempted New: "${newStatus}"`);
              if (taskData.status !== newStatus) {
                taskData.status = newStatus;
                animateTaskStatusUpdate(objectToUpdate);
                console.log(`[Socket object-property-updated] Status changed to "${newStatus}" for ${data.objectId}.`);
                if (data.userId && data.activityLogEntry) {
                  const logExists = taskData.activityLog.some(entry => entry.timestamp === data.activityLogEntry!.timestamp && entry.userId === data.activityLogEntry!.userId && entry.action === data.activityLogEntry!.action);
                  if (!logExists) {
                      taskData.activityLog.push(data.activityLogEntry);
                      console.log(`[Socket object-property-updated] Pushed received activityLogEntry for status update.`);
                  } else {
                      console.log(`[Socket object-property-updated] Skipped pushing duplicate activityLogEntry for status update.`);
                  }
                } else if (data.userId) {
                   taskData.activityLog.push({
                    timestamp: new Date().toISOString(),
                    userId: data.userId,
                    action: 'Task status updated (remote)',
                    details: `Status changed from '${oldStatus}' to '${newStatus}'`
                  });
                  console.log(`[Socket object-property-updated] Pushed generated activityLogEntry for remote status update.`);
                }
              } else {
                console.log(`[Socket object-property-updated] Status for ${data.objectId} already "${newStatus}". No change made.`);
              }
              panelNeedsRefresh = true;
            } else if (taskData && data.property === 'taskChecklistUpdate' && typeof data.value === 'object') {
              const checklistUpdate = data.value as ChecklistUpdateAction;
              console.log(`[Socket object-property-updated] Checklist update for ${data.objectId}. Action: ${checklistUpdate.action}, ItemID: ${checklistUpdate.itemId}, Item: ${JSON.stringify(checklistUpdate.item)}`);
              let itemTextForLog = '';

              if (!taskData.activityLog) {
                taskData.activityLog = [];
              }

              if (checklistUpdate.action === 'add') {
                if (checklistUpdate.item) {
                  if (!taskData.checklist.find(i => i.id === checklistUpdate.item!.id)) {
                    taskData.checklist.push(checklistUpdate.item);
                    itemTextForLog = checklistUpdate.item.text;
                     console.log(`[Socket object-property-updated] Checklist: Added item "${checklistUpdate.item?.text}"`);
                  } else {
                    console.log(`[Socket object-property-updated] Checklist: Item "${checklistUpdate.item?.text}" already exists, not adding again.`);
                  }
                } else {
                  console.warn('[Socket object-property-updated] Checklist add action received without item data.');
                }
              } else if (checklistUpdate.action === 'remove' && checklistUpdate.itemId) {
                const itemToRemove = taskData.checklist.find(i => i.id === checklistUpdate.itemId);
                if (itemToRemove) itemTextForLog = itemToRemove.text;
                taskData.checklist = taskData.checklist.filter((item: ChecklistItem) => item.id !== checklistUpdate.itemId);
                console.log(`[Socket object-property-updated] Checklist: Removed item "${itemTextForLog}" (ID: ${checklistUpdate.itemId})`);
              } else if (checklistUpdate.action === 'toggle' && checklistUpdate.itemId && typeof checklistUpdate.completed === 'boolean') {
                const itemToToggle = taskData.checklist.find(item => item.id === checklistUpdate.itemId);
                if (itemToToggle) {
                  itemToToggle.completed = checklistUpdate.completed;
                  itemTextForLog = itemToToggle.text;
                  console.log(`[Socket object-property-updated] Checklist: Toggled item "${itemTextForLog}" to ${checklistUpdate.completed}`);
                }
              } else if (checklistUpdate.action === 'editText' && checklistUpdate.itemId && typeof checklistUpdate.newText === 'string') {
                const itemToEdit = taskData.checklist.find(item => item.id === checklistUpdate.itemId);
                if (itemToEdit) {
                  itemTextForLog = `from "${itemToEdit.text}" to "${checklistUpdate.newText}"`;
                  console.log(`[Socket object-property-updated] Checklist: Edited item ID ${checklistUpdate.itemId} ${itemTextForLog}`);
                  itemToEdit.text = checklistUpdate.newText;
                }
              }
              console.log(`[Socket object-property-updated] Checklist for ${data.objectId} AFTER update:`, JSON.stringify(taskData.checklist, null, 2));
              panelNeedsRefresh = true;
              if (data.userId && data.activityLogEntry) {
                const logExists = taskData.activityLog.some(entry =>
                    entry.timestamp === data.activityLogEntry!.timestamp &&
                    entry.userId === data.activityLogEntry!.userId &&
                    entry.action === data.activityLogEntry!.action &&
                    entry.details === data.activityLogEntry!.details
                );
                if (!logExists) {
                    taskData.activityLog.push(data.activityLogEntry);
                    console.log(`[Socket object-property-updated] Pushed received activityLogEntry for checklist update.`);
                } else {
                    console.log(`[Socket object-property-updated] Skipped pushing duplicate activityLogEntry for checklist update.`);
                }
              } else if (data.userId) {
                taskData.activityLog.push({
                  timestamp: new Date().toISOString(),
                  userId: data.userId,
                  action: `Checklist ${checklistUpdate.action} (remote)`,
                  details: itemTextForLog || checklistUpdate.itemId || 'N/A'
                });
                console.log(`[Socket object-property-updated] Pushed generated activityLogEntry for remote checklist update.`);
              }
            }
            console.log(`[Socket object-property-updated] Object ${data.objectId} taskData AFTER update:`, JSON.stringify(objectToUpdate.userData.taskData, null, 2));

            if (panelNeedsRefresh) {
              if (currentSelectedObjectForPanelRef.current && currentSelectedObjectForPanelRef.current.userData.sharedId === data.objectId) {
                console.log(`[Socket object-property-updated] Requesting panel refresh for ${data.objectId}.`);
                setCurrentSelectedObjectForPanel(null);
                setCurrentSelectedObjectForPanel(objectToUpdate);
              }
            }
          }
        } else {
          console.warn(`[Socket object-property-updated] Object with ID ${data.objectId} not found locally.`);
        }
      });

      socket.on('cursor-updated', (data: CursorUpdateData) => {
        if (data.userId === socket.id) return;

        // Get user color from connected users or use the one from data
        const userColor = data.color || connectedUsers.find(u => u.id === data.userId)?.color || '#ff0000';

        let cursorMesh = remoteCursorsRef.current.get(data.userId);

        if (!cursorMesh) {
          // Create a more visible cursor with combined shapes
          const cursorGroup = new THREE.Group();

          // Create cone for cursor pointer
          const cursorGeometry = new THREE.ConeGeometry(0.06, 0.2, 8);
          const cursorMaterial = new THREE.MeshStandardMaterial({
            color: userColor,
            emissive: new THREE.Color(userColor).multiplyScalar(0.4),
            emissiveIntensity: 0.7
          });
          const cone = new THREE.Mesh(cursorGeometry, cursorMaterial);
          cone.rotation.x = Math.PI; // Point downward
          cursorGroup.add(cone);

          // Add small sphere at top for better visibility
          const sphereGeometry = new THREE.SphereGeometry(0.04, 16, 16);
          const sphereMaterial = new THREE.MeshStandardMaterial({
            color: '#ffffff',
            emissive: new THREE.Color(userColor),
            emissiveIntensity: 0.5
          });
          const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
          sphere.position.y = 0.12; // Position at tip of cone
          cursorGroup.add(sphere);

          cursorGroup.name = `cursor-${data.userId}`;
          sceneRef.current?.add(cursorGroup);
          remoteCursorsRef.current.set(data.userId, cursorGroup as unknown as THREE.Mesh);
          console.log(`[Client ${socket.id?.substring(0,5)}] Created enhanced cursor for ${data.userId}`);

          cursorMesh = cursorGroup as unknown as THREE.Mesh;
        }

        if (cursorMesh) {
          // Use GSAP for smooth cursor movement
          gsap.to(cursorMesh.position, {
            x: data.position.x,
            y: data.position.y + 0.15, // Slight lift for better visibility
            z: data.position.z,
            duration: 0.2,
            ease: 'power2.out'
          });

          // Make cursor "pulse" slightly when it moves
          gsap.to(cursorMesh.scale, {
            x: 1.2, y: 1.2, z: 1.2,
            duration: 0.1,
            yoyo: true,
            repeat: 1,
            ease: 'power1.inOut'
          });

          // Update cursor color if it changed
          if (cursorMesh.children && cursorMesh.children.length > 0) {
            cursorMesh.children.forEach(child => {
              if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
                if (child.geometry instanceof THREE.ConeGeometry) {
                  child.material.color.set(userColor);
                  child.material.emissive.set(new THREE.Color(userColor).multiplyScalar(0.4));
                } else if (child.geometry instanceof THREE.SphereGeometry) {
                  child.material.emissive.set(new THREE.Color(userColor));
                }
              }
            });
          }
        }
      });

      socket.on('user-cursor-removed', (data: { userId: string }) => {
        const cursorToRemove = remoteCursorsRef.current.get(data.userId);
        if (cursorToRemove) {
          // Remove cursor from scene
          sceneRef.current?.remove(cursorToRemove);

          // Clean up all children if it's a group
          if (cursorToRemove.children && cursorToRemove.children.length > 0) {
            cursorToRemove.children.forEach(child => {
              if (child instanceof THREE.Mesh) {
                if (child.geometry) child.geometry.dispose();
                if (child.material instanceof THREE.Material) child.material.dispose();
              }
            });
          }

          // Clean up the cursor itself
          if (cursorToRemove.geometry) cursorToRemove.geometry.dispose();
          if (cursorToRemove.material instanceof THREE.Material) cursorToRemove.material.dispose();

          // Remove from tracking map
          remoteCursorsRef.current.delete(data.userId);
          console.log(`[Client] Removed cursor for user ${data.userId}`);
        }
      });

      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();

      const onPointerDown = (event: PointerEvent) => {
        if (!rendererRef.current || !cameraRef.current) return;
        const rect = rendererRef.current.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, cameraRef.current);
        const intersects = raycaster.intersectObjects(interactiveObjects.current, false);
        if (intersects.length > 0) {
          const firstIntersectedObject = intersects[0].object as THREE.Mesh;
          if (selectedObject.current && selectedObject.current !== firstIntersectedObject) {
            gsap.killTweensOf(selectedObject.current.scale);
            gsap.to(selectedObject.current.scale, { x: 1, y: 1, z: 1, duration: 0.2, ease: 'power2.inOut' });
            const prevMat = originalMaterials.current.get(selectedObject.current);
            if (prevMat && selectedObject.current.material instanceof THREE.MeshStandardMaterial) {
              (selectedObject.current.material as THREE.MeshStandardMaterial).emissive.setHex((prevMat as THREE.MeshStandardMaterial).emissive?.getHex() ?? 0x000000);
            }
          }
          selectedObject.current = firstIntersectedObject;
          setCurrentSelectedObjectForPanel(firstIntersectedObject);

          if (selectedObject.current.material instanceof THREE.MeshStandardMaterial) {
            (selectedObject.current.material as THREE.MeshStandardMaterial).emissive.setHex(0x555500);
          }
          gsap.killTweensOf(selectedObject.current.scale);
          gsap.timeline()
            .to(selectedObject.current.scale, { x: 1.3, y: 1.3, z: 1.3, duration: 0.15, ease: 'back.out(1.7)' })
            .to(selectedObject.current.scale, { x: 1.1, y: 1.1, z: 1.1, duration: 0.3, ease: 'power2.out' });

          initialDragStateRef.current = {
            position: selectedObject.current.position.clone(),
            rotation: selectedObject.current.rotation.clone(),
            scale: selectedObject.current.scale.clone(),
            taskStatus: selectedObject.current.userData.taskData?.status,
          };
          selectedObject.current.getWorldPosition(worldPosition.current);
          cameraRef.current.getWorldDirection(dragPlaneRef.current.normal);
          dragPlaneRef.current.setFromNormalAndCoplanarPoint(dragPlaneRef.current.normal, worldPosition.current);
          if (raycaster.ray.intersectPlane(dragPlaneRef.current, intersectionRef.current)) {
            offsetRef.current.copy(worldPosition.current).sub(intersectionRef.current);
          }
          controls.enabled = false;
          isDraggingRef.current = true;
        } else {
          if (selectedObject.current) {
            gsap.killTweensOf(selectedObject.current.scale);
            gsap.to(selectedObject.current.scale, { x: 1, y: 1, z: 1, duration: 0.2, ease: 'power2.inOut' });
            const prevMat = originalMaterials.current.get(selectedObject.current);
            if (prevMat && selectedObject.current.material instanceof THREE.MeshStandardMaterial) {
              (selectedObject.current.material as THREE.MeshStandardMaterial).emissive.setHex((prevMat as THREE.MeshStandardMaterial).emissive?.getHex() ?? 0x000000);
            }
            selectedObject.current = null;
            setCurrentSelectedObjectForPanel(null);
          }
          initialDragStateRef.current = null;
        }
      };

      const onPointerMove = (event: PointerEvent) => {
        if (!rendererRef.current || !cameraRef.current) return;
        const rect = rendererRef.current.domElement.getBoundingClientRect();
        const currentMouse = new THREE.Vector2();
        currentMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        currentMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        if (isDraggingRef.current && selectedObject.current) {
          raycaster.setFromCamera(currentMouse, cameraRef.current);
          if (raycaster.ray.intersectPlane(dragPlaneRef.current, intersectionRef.current)) {
            selectedObject.current.position.copy(intersectionRef.current).add(offsetRef.current);
          }
        }
        if (!isDraggingRef.current && sceneRef.current && cameraRef.current) {
          raycaster.setFromCamera(currentMouse, cameraRef.current);
          const cursorIntersection = new THREE.Vector3();
          if (raycaster.ray.intersectPlane(groundPlaneRef.current, cursorIntersection)) {
            socket.emit('cursor-moved', { position: cursorIntersection });
          }
        }
      };

      const onPointerUp = () => {
        if (isDraggingRef.current && selectedObject.current && initialDragStateRef.current) {
          isDraggingRef.current = false;
          controls.enabled = true;

          const currentObj = selectedObject.current;
          const oldState = initialDragStateRef.current;

          let finalNewStatusForCommand: TaskData['status'] | undefined = oldState.taskStatus;

          if (currentObj.userData.taskData) {
            const actualOldStatusAtDragStart = oldState.taskStatus;
            let finalDropZone: ListZone | undefined = undefined;

            for (const zone of listZonesRef.current) {
              if (zone.mesh) {
                const zoneHalfWidth = zone.size.width / 2;
                const zoneHalfDepth = zone.size.depth / 2;
                const objPos = currentObj.position;

                if (
                  objPos.x >= zone.position.x - zoneHalfWidth &&
                  objPos.x <= zone.position.x + zoneHalfWidth &&
                  objPos.z >= zone.position.z - zoneHalfDepth &&
                  objPos.z <= zone.position.z + zoneHalfDepth
                ) {
                  finalDropZone = zone;
                  break;
                }
              }
            }

            if (finalDropZone) {
              finalNewStatusForCommand = finalDropZone.name;
              if (finalNewStatusForCommand !== actualOldStatusAtDragStart) {
                currentObj.position.set(
                  finalDropZone.position.x + (Math.random() - 0.5) * finalDropZone.size.width * 0.8,
                  currentObj.position.y,
                  finalDropZone.position.z + (Math.random() - 0.5) * finalDropZone.size.depth * 0.8
                );
                console.log(`Task ${currentObj.userData.sharedId} status will change from ${actualOldStatusAtDragStart} to ${finalNewStatusForCommand} and snapped to new zone.`);
              }
            }
          }

          const commandData: MoveObjectCommandData = {
            objectId: currentObj.userData.sharedId,
            oldPosition: { x: oldState.position.x, y: oldState.position.y, z: oldState.position.z },
            newPosition: { x: currentObj.position.x, y: currentObj.position.y, z: currentObj.position.z },
            oldRotation: { x: oldState.rotation.x, y: oldState.rotation.y, z: oldState.rotation.z, order: oldState.rotation.order },
            newRotation: { x: currentObj.rotation.x, y: currentObj.rotation.y, z: currentObj.rotation.z, order: currentObj.rotation.order },
            oldScale: { x: oldState.scale.x, y: oldState.scale.y, z: oldState.scale.z },
            newScale: { x: currentObj.scale.x, y: currentObj.scale.y, z: currentObj.scale.z },
            oldTaskStatus: oldState.taskStatus,
            newTaskStatus: finalNewStatusForCommand
          };

          const posChanged = !oldState.position.equals(currentObj.position);
          const rotChanged = !oldState.rotation.equals(currentObj.rotation);
          const scaleChanged = !oldState.scale.equals(currentObj.scale);
          const statusChangedByThisDrag = oldState.taskStatus !== finalNewStatusForCommand;

          if (posChanged || rotChanged || scaleChanged || statusChangedByThisDrag) {
            const moveCommand = new MoveObjectCommandImpl(
              interactiveObjects,
              socket,
              commandData,
              `Update ${currentObj.userData.sharedId}`,
              animateTaskStatusUpdate
            );
            recordAndExecuteCommand(moveCommand);
          }
          initialDragStateRef.current = null;
        }
      };

      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointermove', onPointerMove);
      renderer.domElement.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointerup', onPointerUp);

      const animate = () => {
        requestAnimationFrame(animate);
        controls.update();
        if (sceneRef.current && cameraRef.current && rendererRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      };
      animate();

      const handleResize = () => {
        if (cameraRef.current && rendererRef.current) {
          cameraRef.current.aspect = window.innerWidth / window.innerHeight;
          cameraRef.current.updateProjectionMatrix();
          rendererRef.current.setSize(window.innerWidth, window.innerHeight);
        }
      };
      window.addEventListener('resize', handleResize);

      const capturedRenderer = rendererRef.current;
      const capturedInteractiveObjects = [...interactiveObjects.current];
      const capturedOriginalMaterials = originalMaterials.current;
      const capturedRemoteCursors = remoteCursorsRef.current;
      const capturedListZones = [...listZonesRef.current];

      console.log('[Main Effect] Successfully executed ALL setup logic inside try block.');

      return () => {
        console.log('[Main Effect] Cleanup function running. Setup was attempted:', setupAttempted);
        console.log('[Main Effect] is3DMode state during cleanup:', is3DMode);

        // Skip full cleanup if we're transitioning to 3D mode
        if (is3DMode) {
          console.log('[Main Effect] Skipping full cleanup because we are transitioning to 3D mode');
          return;
        }

        if (setupAttempted) {
          console.log('[Main Effect] Proceeding with full cleanup of resources.');

          const socket = socketRef.current;
          if (socket) {
            socket.off('connect');
            socket.off('disconnect');
            socket.off('server-event');
            socket.off('object-updated');
            socket.off('object-created');
            socket.off('object-deleted');
            socket.off('user-list-updated');
            socket.off('object-property-updated');
            socket.off('cursor-updated');
            socket.off('user-cursor-removed');
          }
          window.removeEventListener('resize', handleResize);

          if (capturedRenderer && capturedRenderer.domElement) {
            capturedRenderer.domElement.removeEventListener('pointerdown', onPointerDown);
            capturedRenderer.domElement.removeEventListener('pointermove', onPointerMove);
            capturedRenderer.domElement.removeEventListener('pointerup', onPointerUp);
          }
          window.removeEventListener('pointerup', onPointerUp);

          if (mountRef.current && capturedRenderer && capturedRenderer.domElement) {
            // Check if the renderer's domElement is actually a child of mountRef.current
            if (mountRef.current.contains(capturedRenderer.domElement)) {
              try {
                mountRef.current.removeChild(capturedRenderer.domElement);
              } catch (error) {
                console.warn('[Cleanup] Error removing renderer DOM element:', error);
              }
            } else {
              console.log('[Cleanup] Renderer DOM element is not a child of mount point, skipping removal');
            }
          }

          if(capturedRenderer) capturedRenderer.dispose();

          capturedInteractiveObjects.forEach(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
              if (Array.isArray(obj.material)) {
                obj.material.forEach(mat => mat.dispose());
              } else {
                (obj.material as THREE.Material).dispose();
              }
            }
          });

          capturedOriginalMaterials.forEach(mat => {
            if (Array.isArray(mat)) {
              mat.forEach(m => m.dispose()); // Corrected: m.dispose() instead of mat.dispose()
            } else {
              mat.dispose();
            }
          });
          capturedOriginalMaterials.clear();

          capturedRemoteCursors.forEach(cursor => {
            // Clean up all children if it's a group
            if (cursor.children && cursor.children.length > 0) {
              cursor.children.forEach(child => {
                if (child instanceof THREE.Mesh) {
                  if (child.geometry) child.geometry.dispose();
                  if (child.material instanceof THREE.Material) child.material.dispose();
                }
              });
            }

            // Clean up the cursor itself
            if(cursor.geometry) cursor.geometry.dispose();
            if(cursor.material && cursor.material instanceof THREE.Material) cursor.material.dispose();
          });
          capturedRemoteCursors.clear();

          capturedListZones.forEach(zoneData => {
            if (zoneData.mesh) {
              sceneRef.current?.remove(zoneData.mesh);
              zoneData.mesh.geometry.dispose();
              if (zoneData.mesh.material instanceof THREE.Material) {
                zoneData.mesh.material.dispose();
              }
            }
          });
          listZonesRef.current = [];

          sceneRef.current = null;
          cameraRef.current = null;
          rendererRef.current = null;
          interactiveObjects.current = [];
          originalMaterials.current = new Map();
          remoteCursorsRef.current = new Map();
          undoStackRef.current = [];
          redoStackRef.current = [];
          console.log('[Main Effect] Finished executing cleanup logic.');
        } else {
          console.log('[Main Effect] Cleanup skipped or minimal as full setup was not attempted/completed.');
        }
      };
    } catch (error) {
      console.error('[Main Effect] CRITICAL ERROR during initialization or setup phase:', error);
      if (error instanceof Error) {
        console.error('[Main Effect] Error message:', error.message);
        console.error('[Main Effect] Error stack:', error.stack);
      }
    }
  }, [showLandingPage, is3DMode, forceUpdate, recordAndExecuteCommand, updateUndoRedoState, handleUndo, handleRedo, animateTaskStatusUpdate, getSocket]);

  const sphereExists = interactiveObjects.current.some(obj => obj.userData.sharedId === 'shared_sphere');

  useEffect(() => {
    if (sphereExists && !sphereYUpdateAttempted.current) {
      const timer = setTimeout(() => {
        const sphere = interactiveObjects.current.find(obj => obj.userData.sharedId === 'shared_sphere');
        if (sphere) {
          sphere.position.y = 5;
          sphereYUpdateAttempted.current = true;
          console.log('[App useEffect Y-Update] Updated Y position for shared_sphere.');
        } else {
          console.warn('[App useEffect Y-Update] shared_sphere disappeared before update could be applied.');
        }
      }, 2000);

      return () => clearTimeout(timer);
    }

    if (!sphereExists && sphereYUpdateAttempted.current) {
      sphereYUpdateAttempted.current = false;
    }
  }, [sphereExists]);

  // We'll use the existing refs for object interaction

  // Initialize or reinitialize 2D interface
  useEffect(() => {
    // Only run this effect when we're in 2D mode (not 3D mode and not on landing page)
    if (is3DMode || showLandingPage || !mountRef.current) {
      return;
    }

    // Get socket and user
    const socket = getSocket();
    const { user } = authState;

    console.log('[2D Init Effect] Initializing 2D interface');

    // Clear any existing content
    while (mountRef.current.firstChild) {
      mountRef.current.removeChild(mountRef.current.firstChild);
    }

    // Initialize the scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeeeeee); // Light gray background for 2D mode
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    cameraRef.current = camera;
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    rendererRef.current = renderer;
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    // Add basic controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 2;
    controls.maxDistance = 10;

    // Add basic lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // Add list zones
    listZonesRef.current = [
      { name: 'To Do', position: new THREE.Vector3(-4, 0.01, 0), size: { width: 3, depth: 4 }, color: new THREE.Color(0xff6347) /* Tomato */ },
      { name: 'In Progress', position: new THREE.Vector3(0, 0.01, 0), size: { width: 3, depth: 4 }, color: new THREE.Color(0xffd700) /* Gold */ },
      { name: 'Done', position: new THREE.Vector3(4, 0.01, 0), size: { width: 3, depth: 4 }, color: new THREE.Color(0x90ee90) /* LightGreen */ },
    ];

    listZonesRef.current.forEach(zoneData => {
      const zoneGeometry = new THREE.PlaneGeometry(zoneData.size.width, zoneData.size.depth);
      const zoneMaterial = new THREE.MeshStandardMaterial({ color: zoneData.color, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
      const zoneMesh = new THREE.Mesh(zoneGeometry, zoneMaterial);
      zoneMesh.position.copy(zoneData.position);
      zoneMesh.rotation.x = -Math.PI / 2; // Rotate to lay flat on XZ plane
      scene.add(zoneMesh);
      zoneData.mesh = zoneMesh; // Store mesh reference
    });

    // Add the original objects (cube, sphere, torus)
    const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
    const cubeMaterial = new THREE.MeshStandardMaterial({ color: 0x007bff, name: 'cubeMaterial' });
    const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    cube.position.x = -2;
    cube.userData.originalColor = new THREE.Color(0x007bff);
    cube.userData.sharedId = 'shared_cube';
    cube.userData.objectType = 'cube';
    cube.userData.taskData = {
      title: 'Cube Task',
      description: 'Default description for cube task.',
      status: 'To Do',
      checklist: [],
      activityLog: [{
        timestamp: new Date().toISOString(),
        userId: 'system',
        action: 'Task Created',
        details: 'Task initialized for shared_cube'
      }]
    };
    scene.add(cube);
    interactiveObjects.current.push(cube);
    originalMaterials.current.set(cube, cubeMaterial.clone());

    const sphereGeometry = new THREE.SphereGeometry(0.75, 32, 32);
    const sphereMaterial = new THREE.MeshStandardMaterial({ color: 0xff4500, name: 'sphereMaterial' });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.x = 0;
    sphere.userData.originalColor = new THREE.Color(0xff4500);
    sphere.userData.sharedId = 'shared_sphere';
    sphere.userData.objectType = 'sphere';
    sphere.userData.taskData = {
      title: 'Sphere Task',
      description: 'Default description for sphere task.',
      status: 'To Do',
      checklist: [],
      activityLog: [{
        timestamp: new Date().toISOString(),
        userId: 'system',
        action: 'Task Created',
        details: 'Task initialized for shared_sphere'
      }]
    };
    scene.add(sphere);
    interactiveObjects.current.push(sphere);
    originalMaterials.current.set(sphere, sphereMaterial.clone());

    const torusGeometry = new THREE.TorusGeometry(0.6, 0.2, 16, 100);
    const torusMaterial = new THREE.MeshStandardMaterial({ color: 0x28a745, name: 'torusMaterial' });
    const torus = new THREE.Mesh(torusGeometry, torusMaterial);
    torus.position.x = 2;
    torus.userData.originalColor = new THREE.Color(0x28a745);
    torus.userData.sharedId = 'shared_torus';
    torus.userData.objectType = 'torus';
    torus.userData.taskData = {
      title: 'Torus Task',
      description: 'Default description for torus task.',
      status: 'To Do',
      checklist: [],
      activityLog: [{
        timestamp: new Date().toISOString(),
        userId: 'system',
        action: 'Task Created',
        details: 'Task initialized for shared_torus'
      }]
    };
    scene.add(torus);
    interactiveObjects.current.push(torus);
    originalMaterials.current.set(torus, torusMaterial.clone());

    // Add animations
    gsap.to(cube.rotation, { y: Math.PI * 2, duration: 7, repeat: -1, ease: 'linear' });
    gsap.to(sphere.rotation, { y: -Math.PI * 2, duration: 10, repeat: -1, ease: 'linear' });
    gsap.to(torus.rotation, { x: Math.PI * 2, duration: 8, repeat: -1, ease: 'linear' });

    // Set up raycaster for object interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // Add event listeners for object interaction
    const handleMouseMove = (event: MouseEvent) => {
      // Update mouse position for raycaster
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

      // Update cursor position for sharing
      if (socket) {
        // Create a raycaster for cursor position
        const cursorRaycaster = new THREE.Raycaster();
        cursorRaycaster.setFromCamera(new THREE.Vector2(mouse.x, mouse.y), camera);

        // Get camera direction for better plane orientation
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);

        // Create a plane that adapts to the camera view for better cursor positioning
        const cursorPlaneNormal = new THREE.Vector3();

        // Use the camera's view direction to determine the best cursor plane
        if (Math.abs(cameraDirection.y) > 0.9) {
          // If looking directly up/down, use a horizontal plane
          cursorPlaneNormal.set(0, 1, 0);
        } else {
          // Otherwise, use a plane that's perpendicular to the camera but aligned with world up
          cursorPlaneNormal.copy(cameraDirection);

          // Make sure the plane normal is not parallel to the world up vector
          const worldUp = new THREE.Vector3(0, 1, 0);
          const right = new THREE.Vector3().crossVectors(cameraDirection, worldUp).normalize();
          cursorPlaneNormal.crossVectors(right, worldUp).normalize();
        }

        // Create the cursor plane at y=0 (or adjust based on scene)
        const cursorPlane = new THREE.Plane(cursorPlaneNormal, 0);
        const intersection = new THREE.Vector3();

        // Find intersection with the plane
        if (cursorRaycaster.ray.intersectPlane(cursorPlane, intersection)) {
          // Emit the 3D position for better accuracy
          socket.emit('cursor-moved', {
            position: {
              x: intersection.x,
              y: intersection.y,
              z: intersection.z
            }
          });
        }

        // Also emit 2D coordinates for fallback
        socket.emit('cursor-move', {
          x: event.clientX,
          y: event.clientY,
          userId: socket.id
        });
      }

      // Check if we're over the properties panel
      const propertiesPanel = document.querySelector('.properties-panel');
      if (propertiesPanel && propertiesPanel.contains(event.target as Node)) {
        // We're over the properties panel, don't do any hover effects
        return;
      }

      // Handle object dragging
      if (isDraggingRef.current && selectedObject.current) {
        // Dragging is handled in handleDrag function
        return;
      }

      // Check for hover over interactive objects
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(interactiveObjects.current);

      // Reset all previously hovered objects
      interactiveObjects.current.forEach(obj => {
        if (obj.userData.isHovered && !intersects.find(i => i.object === obj)) {
          obj.userData.isHovered = false;
          if (!obj.userData.isSelected) {
            const material = obj.material as THREE.MeshStandardMaterial;
            material.emissive.set(0x000000);
          }
        }
      });

      // Handle hover effects
      if (intersects.length > 0) {
        const object = intersects[0].object as THREE.Mesh;
        if (!object.userData.isHovered && !object.userData.isSelected) {
          object.userData.isHovered = true;
          const material = object.material as THREE.MeshStandardMaterial;
          material.emissive.set(0x333333);
        }

        // Change cursor style
        document.body.style.cursor = 'pointer';
      } else {
        document.body.style.cursor = 'default';
      }
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return; // Only handle left mouse button

      // Check if we're clicking on the properties panel
      const propertiesPanel = document.querySelector('.properties-panel');
      if (propertiesPanel && propertiesPanel.contains(event.target as Node)) {
        console.log('[handleMouseDown] Click inside properties panel, ignoring');
        return; // Ignore clicks inside the properties panel
      }

      // Check for intersection with objects
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(interactiveObjects.current);

      if (intersects.length > 0) {
        const newSelectedObject = intersects[0].object as THREE.Mesh;

        // Deselect previously selected object
        if (selectedObject.current && selectedObject.current !== newSelectedObject) {
          selectedObject.current.userData.isSelected = false;
          const prevMaterial = selectedObject.current.material as THREE.MeshStandardMaterial;
          prevMaterial.emissive.set(0x000000);
        }

        // Select new object
        newSelectedObject.userData.isSelected = true;
        const material = newSelectedObject.material as THREE.MeshStandardMaterial;
        material.emissive.set(0x555555);

        // Update selected object reference
        selectedObject.current = newSelectedObject;
        setCurrentSelectedObjectForPanel(newSelectedObject);

        // Start drag operation
        isDraggingRef.current = true;

        // Store initial state for undo/redo
        initialDragStateRef.current = {
          position: newSelectedObject.position.clone(),
          rotation: newSelectedObject.rotation.clone(),
          scale: newSelectedObject.scale.clone(),
          taskStatus: newSelectedObject.userData.taskData?.status,
        };

        // Store the starting position for drag offset
        offsetRef.current.copy(newSelectedObject.position);

        // Get camera direction for better drag plane orientation
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);

        // Create a plane normal that adapts to the camera view
        const planeNormal = new THREE.Vector3();

        // Use the camera's view direction to determine the best drag plane
        if (Math.abs(cameraDirection.y) > 0.9) {
          // If looking directly up/down, use a horizontal plane
          planeNormal.set(0, 1, 0);
        } else {
          // Otherwise, use a plane that's perpendicular to the camera but aligned with world up
          planeNormal.copy(cameraDirection);

          // Make sure the plane normal is not parallel to the world up vector
          const worldUp = new THREE.Vector3(0, 1, 0);
          const right = new THREE.Vector3().crossVectors(cameraDirection, worldUp).normalize();
          planeNormal.crossVectors(right, worldUp).normalize();
        }

        // Set up the drag plane at the object's current position
        dragPlaneRef.current.setFromNormalAndCoplanarPoint(
          planeNormal,
          newSelectedObject.position.clone()
        );

        // Get world position for more accurate dragging
        newSelectedObject.getWorldPosition(worldPosition.current);

        // Update controls
        controls.enabled = false;
      } else {
        // Check if we clicked on the properties panel before deselecting
        const clickedOnPanel = event.target instanceof Element &&
          (event.target.closest('.properties-panel') !== null);

        if (!clickedOnPanel) {
          // Deselect if clicking on empty space and not on the panel
          if (selectedObject.current) {
            selectedObject.current.userData.isSelected = false;
            const material = selectedObject.current.material as THREE.MeshStandardMaterial;
            material.emissive.set(0x000000);
            selectedObject.current = null;
            setCurrentSelectedObjectForPanel(null);
          }
        }
      }
    };

    const handleMouseUp = () => {
      // Always re-enable controls on mouse up, regardless of dragging state
      if (controls) {
        controls.enabled = true;
      }

      if (isDraggingRef.current && selectedObject.current && initialDragStateRef.current) {
        isDraggingRef.current = false;

        // Only record command if position actually changed
        if (!selectedObject.current.position.equals(initialDragStateRef.current.position)) {
          const currentObj = selectedObject.current;
          const oldState = initialDragStateRef.current;

          let finalNewStatusForCommand: TaskData['status'] | undefined = oldState.taskStatus;

          if (currentObj.userData.taskData) {
            const actualOldStatusAtDragStart = oldState.taskStatus;
            let finalDropZone: ListZone | undefined = undefined;

            for (const zone of listZonesRef.current) {
              if (zone.mesh) {
                const zoneHalfWidth = zone.size.width / 2;
                const zoneHalfDepth = zone.size.depth / 2;
                const objPos = currentObj.position;

                if (
                  objPos.x >= zone.position.x - zoneHalfWidth &&
                  objPos.x <= zone.position.x + zoneHalfWidth &&
                  objPos.z >= zone.position.z - zoneHalfDepth &&
                  objPos.z <= zone.position.z + zoneHalfDepth
                ) {
                  finalDropZone = zone;
                  break;
                }
              }
            }

            if (finalDropZone) {
              finalNewStatusForCommand = finalDropZone.name;
              if (finalNewStatusForCommand !== actualOldStatusAtDragStart) {
                currentObj.position.set(
                  finalDropZone.position.x + (Math.random() - 0.5) * finalDropZone.size.width * 0.8,
                  currentObj.position.y,
                  finalDropZone.position.z + (Math.random() - 0.5) * finalDropZone.size.depth * 0.8
                );
                console.log(`Task ${currentObj.userData.sharedId} status will change from ${actualOldStatusAtDragStart} to ${finalNewStatusForCommand} and snapped to new zone.`);
              }
            }
          }

          const commandData: MoveObjectCommandData = {
            objectId: currentObj.userData.sharedId,
            oldPosition: { x: oldState.position.x, y: oldState.position.y, z: oldState.position.z },
            newPosition: { x: currentObj.position.x, y: currentObj.position.y, z: currentObj.position.z },
            oldRotation: { x: oldState.rotation.x, y: oldState.rotation.y, z: oldState.rotation.z, order: oldState.rotation.order },
            newRotation: { x: currentObj.rotation.x, y: currentObj.rotation.y, z: currentObj.rotation.z, order: currentObj.rotation.order },
            oldScale: { x: oldState.scale.x, y: oldState.scale.y, z: oldState.scale.z },
            newScale: { x: currentObj.scale.x, y: currentObj.scale.y, z: currentObj.scale.z },
            oldTaskStatus: oldState.taskStatus,
            newTaskStatus: finalNewStatusForCommand
          };

          const posChanged = !oldState.position.equals(currentObj.position);
          const rotChanged = !oldState.rotation.equals(currentObj.rotation);
          const scaleChanged = !oldState.scale.equals(currentObj.scale);
          const statusChangedByThisDrag = oldState.taskStatus !== finalNewStatusForCommand;

          if ((posChanged || rotChanged || scaleChanged || statusChangedByThisDrag) && socket) {
            const moveCommand = new MoveObjectCommandImpl(
              interactiveObjects,
              socket,
              commandData,
              `Update ${currentObj.userData.sharedId}`,
              animateTaskStatusUpdate
            );
            recordAndExecuteCommand(moveCommand);
          }
          initialDragStateRef.current = null;
        }
      }
    };

    // Add event for object dragging
    const handleDrag = (event: MouseEvent) => {
      if (!isDraggingRef.current || !selectedObject.current) return;

      // Update mouse position for raycaster
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

      // Calculate drag using camera direction
      raycaster.setFromCamera(mouse, camera);

      // Get camera direction for better plane orientation
      const cameraDirection = new THREE.Vector3();
      camera.getWorldDirection(cameraDirection);

      // Create a plane that's always perpendicular to the camera view direction
      // This allows for more intuitive dragging in all directions
      const planeNormal = new THREE.Vector3();

      // Use the camera's view direction to determine the best drag plane
      // This is critical for allowing movement in all axes
      if (Math.abs(cameraDirection.y) > 0.9) {
        // If looking directly up/down, use a horizontal plane
        planeNormal.set(0, 1, 0);
      } else {
        // Otherwise, use a plane that's perpendicular to the camera but aligned with world up
        // This creates a plane that follows the camera's view direction
        planeNormal.copy(cameraDirection);

        // Make sure the plane normal is not parallel to the world up vector
        const worldUp = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(cameraDirection, worldUp).normalize();
        planeNormal.crossVectors(right, worldUp).normalize();
      }

      console.log(`[handleDrag] Plane normal: ${planeNormal.x.toFixed(2)}, ${planeNormal.y.toFixed(2)}, ${planeNormal.z.toFixed(2)}`);

      // Create the drag plane at the object's position
      const objectPosition = selectedObject.current.position.clone();
      const dragPlane = new THREE.Plane(planeNormal, -planeNormal.dot(objectPosition));
      const intersection = new THREE.Vector3();

      // Find intersection with the drag plane
      if (raycaster.ray.intersectPlane(dragPlane, intersection)) {
        // Calculate offset from initial click position
        const dragOffset = intersection.clone().sub(worldPosition.current);

        // Calculate new position
        const newPosition = offsetRef.current.clone().add(dragOffset);

        // Apply the new position directly for immediate feedback
        selectedObject.current.position.copy(newPosition);

        // Add subtle floating effect during dragging for better visual feedback
        const floatHeight = Math.sin(Date.now() * 0.005) * 0.05;
        selectedObject.current.position.y += floatHeight;

        // Add subtle rotation during dragging for more dynamic feel
        const dragRotation = dragOffset.length() * 0.01;
        selectedObject.current.rotation.y += dragRotation * 0.05;

        // Scale effect during dragging
        const currentScale = initialDragStateRef.current?.scale.clone() || new THREE.Vector3(1, 1, 1);
        const scaleMultiplier = 1.0 + Math.sin(Date.now() * 0.01) * 0.03;
        selectedObject.current.scale.set(
          currentScale.x * scaleMultiplier,
          currentScale.y * scaleMultiplier,
          currentScale.z * scaleMultiplier
        );

        // Check which zone the object is in (with null check)
        const newZone = listZonesRef.current.find(zone => {
          if (!selectedObject.current) return false;
          const dx = Math.abs(zone.position.x - selectedObject.current.position.x);
          const dz = Math.abs(zone.position.z - selectedObject.current.position.z);
          return dx < zone.size.width / 2 && dz < zone.size.depth / 2;
        });

        if (newZone && selectedObject.current.userData.taskData) {
          const currentStatus = selectedObject.current.userData.taskData.status;

          // Update task status if zone changed
          if (currentStatus !== newZone.name) {
            selectedObject.current.userData.taskData.status = newZone.name;

            // Add to activity log
            selectedObject.current.userData.taskData.activityLog.push({
              timestamp: new Date().toISOString(),
              userId: user?.id || 'anonymous',
              action: 'Status Changed',
              details: `Status changed from ${currentStatus} to ${newZone.name}`
            });

            // Emit status change to other users
            if (socket) {
              socket.emit('task-status-update', {
                objectId: selectedObject.current.userData.sharedId,
                newStatus: newZone.name,
                oldStatus: currentStatus
              });
            }

            // Animate the status change
            if (animateTaskStatusUpdate) {
              animateTaskStatusUpdate(selectedObject.current);
            }
          }
        }
      }
    };

    // Re-enable event listeners with proper references
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleDrag);

    // Start rendering
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();

      // Force a render of the scene
      renderer.render(scene, camera);
    };
    animate();

    // Force an immediate render when forceUpdate changes
    if (forceUpdate > 0) {
      console.log('[Main Effect] Force update triggered, rendering scene immediately');
      renderer.render(scene, camera);
    }

    // Handle window resize
    const handleResize = () => {
      if (camera && renderer && mountRef.current) {
        const width = window.innerWidth;
        const height = window.innerHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      }
    };
    window.addEventListener('resize', handleResize);

    console.log('[2D Init Effect] 2D interface initialized successfully');

    // Cleanup function
    return () => {
      console.log('[2D Init Effect] Cleaning up 2D interface');
      cancelAnimationFrame(animationFrameId);

      // Remove all event listeners
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleDrag);

      if (renderer) {
        renderer.dispose();
      }

      if (scene) {
        scene.clear();
      }
    };
  }, [is3DMode, showLandingPage, forceUpdate]);

  // Handle 3D mode body class
  useEffect(() => {
    if (is3DMode) {
      document.body.classList.add('three-d-mode');
    } else {
      document.body.classList.remove('three-d-mode');
    }
  }, [is3DMode]);

  useEffect(() => {
    // Collaborative cursors: update 2D overlay positions
    function updateCursorOverlay() {
      const overlay = document.getElementById('collab-cursors-overlay');
      if (!overlay) return;
      overlay.innerHTML = '';
      connectedUsers.forEach(user => {
        if (user.id === getSocket()?.id) return; // Don't show your own cursor
        const cursorMesh = remoteCursorsRef.current.get(user.id);
        if (cursorMesh && rendererRef.current && cameraRef.current) {
          // Project 3D position to 2D screen
          const vector = cursorMesh.position.clone();
          vector.project(cameraRef.current);
          const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
          const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;

          // Create cursor container
          const cursorContainer = document.createElement('div');
          cursorContainer.style.position = 'absolute';
          cursorContainer.style.left = `${x - 7}px`;
          cursorContainer.style.top = `${y - 7}px`;
          cursorContainer.style.display = 'flex';
          cursorContainer.style.flexDirection = 'column';
          cursorContainer.style.alignItems = 'center';
          cursorContainer.style.zIndex = '10000';

          // Create cursor dot
          const dot = document.createElement('div');
          dot.style.width = '14px';
          dot.style.height = '14px';
          dot.style.borderRadius = '50%';
          dot.style.background = user.color;
          dot.style.border = '2px solid #fff';
          dot.style.boxShadow = `0 0 6px ${user.color}`;
          dot.style.opacity = '0.95';
          dot.style.pointerEvents = 'none';

          // Create name label for cursor
          const label = document.createElement('div');
          label.textContent = user.username || `Guest-${user.id.substring(0, 5)}`;
          label.style.background = user.color;
          label.style.color = '#fff';
          label.style.padding = '2px 5px';
          label.style.borderRadius = '3px';
          label.style.fontSize = '10px';
          label.style.marginTop = '2px';
          label.style.fontWeight = 'bold';
          label.style.boxShadow = '0 0 4px rgba(0,0,0,0.3)';
          label.style.whiteSpace = 'nowrap';

          cursorContainer.appendChild(dot);
          cursorContainer.appendChild(label);
          cursorContainer.title = user.username || `Guest-${user.id.substring(0, 5)}`;
          overlay.appendChild(cursorContainer);
        }
      });
    }
    // Update overlay on every animation frame
    let animId: number;
    function animateOverlay() {
      updateCursorOverlay();
      animId = requestAnimationFrame(animateOverlay);
    }
    animateOverlay();
    return () => {
      cancelAnimationFrame(animId);
      const overlay = document.getElementById('collab-cursors-overlay');
      if (overlay) overlay.innerHTML = '';
    };
  }, [connectedUsers, getSocket]);

  // This line is just for removing the state declaration from here

  // Handler for switching back to 2D mode
  const handleExit3DMode = () => {
    console.log('[handleExit3DMode] Exiting 3D mode');

    // Reset all refs to ensure clean state
    sceneRef.current = null;
    cameraRef.current = null;
    rendererRef.current = null;
    interactiveObjects.current = [];
    originalMaterials.current = new Map();
    remoteCursorsRef.current = new Map();

    // Force a window resize event to ensure everything is sized correctly
    window.dispatchEvent(new Event('resize'));

    // Force a re-run of the main effect by triggering a state update
    setForceUpdate(Math.random());

    // Set the state to trigger re-render and activate the 2D init effect
    setIs3DMode(false);

    console.log('[handleExit3DMode] Transition to 2D mode initiated');
  };

  // Main return statement
  if (showLandingPage) {
    return <LandingPage onEnterApp={handleEnterApp} />;
  }

  // 3D Mode
  if (is3DMode) {
    // Make sure socket is initialized before entering 3D mode
    const socket = getSocket();
    if (socket) {
      setSocket(socket);
    }

    // No conditional hooks here - we'll handle this in a separate useEffect

    return (
      <>
        <ThreeDApp />
        <button
          onClick={handleExit3DMode}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            zIndex: 1000,
            background: 'rgba(97, 218, 251, 0.8)',
            color: 'white',
            border: '1px solid #61dafb',
            borderRadius: '5px',
            padding: '8px 16px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Exit 3D Mode
        </button>
      </>
    );
  }

  // 2D Mode (original app)
  return (
    <>
      <div ref={mountRef} style={{ width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0 }} />

      {getSocket() && (
        <PropertiesPanel
          selectedObject={currentSelectedObjectForPanel}
          socket={getSocket()}
          onPropertyUpdate={(property, value, oldValue) => {
            if (currentSelectedObjectForPanel?.userData?.sharedId) {
              handlePropertyUpdateFromPanel(currentSelectedObjectForPanel.userData.sharedId, property, value, oldValue);
            }
          }}
        />
      )}
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        zIndex: 1000,
        background: 'rgba(255, 255, 255, 0.8)',
        padding: '10px',
        borderRadius: '5px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}>
        <div>
          <button onClick={handleUndo} disabled={!canUndo}>Undo</button>
          <button onClick={handleRedo} disabled={!canRedo}>Redo</button>
          <button
            onClick={() => {
              // Make sure socket is initialized before entering 3D mode
              const socket = getSocket();
              if (socket) {
                setSocket(socket);
              }
              setIs3DMode(true);
            }}
            style={{
              marginLeft: '10px',
              background: '#61dafb',
              color: 'white',
              border: 'none',
              padding: '5px 10px',
              borderRadius: '3px'
            }}
          >
            Enter 3D Mode
          </button>
        </div>
        <div>
          <h4>Connected Users:</h4>
          {connectedUsers.length > 0 ? (
            <ul>
              {connectedUsers.map(user => (
                <li key={user.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    display: 'inline-block',
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: user.color,
                    border: '1px solid #888',
                    marginRight: 4
                  }} />
                  <span style={{ fontWeight: user.id === getSocket()?.id ? 'bold' : 'normal', color: user.id === getSocket()?.id ? '#007bff' : '#222' }}>
                    {user.id === getSocket()?.id ?
                      `You (${authState.user?.username || 'Guest'})` :
                      (user.username || `Guest-${user.id.substring(0, 5)}`)}
                  </span>
                  {/* Collaborative cursor indicator */}
                  <span id={`cursor-dot-${user.id}`} style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: user.id === getSocket()?.id ? '#007bff' : user.color,
                    marginLeft: 4,
                    opacity: 0.7,
                    border: user.id === getSocket()?.id ? '2px solid #007bff' : '1px solid #888',
                    boxShadow: user.id !== getSocket()?.id ? '0 0 4px ' + user.color : 'none',
                    transition: 'background 0.2s, box-shadow 0.2s'
                  }} />
                  {/* Real-time presence indicator */}
                  <span style={{
                    marginLeft: 4,
                    color: user.id === getSocket()?.id ? '#007bff' : '#28a745',
                    fontSize: 12,
                    fontWeight: 600
                  }}>
                    {user.id === getSocket()?.id ? 'Online (You)' : 'Online'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No other users connected.</p>
          )}
        </div>
        {/* Advanced: Toast/notification area */}
        <div id="toast-root" style={{ position: 'fixed', bottom: 24, left: 24, zIndex: 2000 }}></div>
      </div>
      {/* Advanced: Confetti canvas (optional, for confetti libraries) */}
      <canvas id="confetti-canvas" style={{ position: 'fixed', pointerEvents: 'none', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 3000 }} />
      {/* Collaborative cursors overlay */}
      <div id="collab-cursors-overlay" style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 9999
      }} />
    </>
  );
}

export default App;
