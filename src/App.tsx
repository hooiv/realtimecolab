import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import io, { Socket } from 'socket.io-client';
import './App.css';
import PropertiesPanel from './components/PropertiesPanel';
import LandingPage from './components/LandingPage'; // Import LandingPage

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
  property: 'taskTitle' | 'taskDescription' | 'taskChecklistUpdate';
  value: string | ChecklistUpdateAction; // string for title/description, ChecklistUpdateAction for checklist
  oldValue: string | ChecklistItem[]; // oldValue for title/description or the entire old checklist for context
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
}

interface CursorUpdateData {
  userId: string;
  color: string;
  position: { x: number; y: number; z: number };
}

export interface Command<T = any> {
  description: string;
  execute(): void;
  undo(): void;
  actionType?: string; // Optional: for specific command types like 'updateTaskProperty'
  actionData?: T;      // Optional: data associated with the action
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
    const object = this.interactiveObjectsRef.current.find(obj => obj.userData.sharedId === this.targetObjectId);
    if (object) {
      object.position.set(pos.x, pos.y, pos.z);
      object.rotation.set(rot.x, rot.y, rot.z, rot.order);
      object.scale.set(scaleVal.x, scaleVal.y, scaleVal.z);
      if (status && object.userData.taskData) {
        object.userData.taskData.status = status;
      }
      return object;
    }
    return null;
  }

  execute(): void {
    const object = this.applyStateAndStatus(
      this.actionData.newPosition,
      this.actionData.newRotation,
      this.actionData.newScale,
      this.actionData.newTaskStatus
    );
    if (object) {
      let activityLogEntry: ActivityLogEntry | undefined = undefined;

      if (this.actionData.newTaskStatus && object.userData.taskData) {
        object.userData.taskData.status = this.actionData.newTaskStatus;
        if (this.actionData.oldTaskStatus !== this.actionData.newTaskStatus) {
          this.animateTaskStatusUpdateFn?.(object);
          activityLogEntry = {
            timestamp: new Date().toISOString(),
            userId: this.socketInstance.id || 'system',
            action: 'Task status changed',
            details: `Status changed from '${this.actionData.oldTaskStatus || 'Unknown'}' to '${this.actionData.newTaskStatus}'`
          };
          if (!object.userData.taskData.activityLog) {
            object.userData.taskData.activityLog = [];
          }
          object.userData.taskData.activityLog.push(activityLogEntry);
        }
      }

      this.socketInstance.emit('object-moved', {
        objectId: this.targetObjectId,
        position: this.actionData.newPosition,
        rotation: this.actionData.newRotation,
        scale: this.actionData.newScale,
        userId: this.socketInstance.id,
        activityLogEntry
      });

      console.log(`[MoveCommand] Executed for ${this.targetObjectId}. New Pos:`, this.actionData.newPosition, `New Status: ${this.actionData.newTaskStatus || 'unchanged'}`);
    }
  }

  undo(): void {
    const object = this.applyStateAndStatus(
      this.actionData.oldPosition,
      this.actionData.oldRotation,
      this.actionData.oldScale,
      this.actionData.oldTaskStatus 
    );
    if (object) {
      let activityLogEntry: ActivityLogEntry | undefined = undefined;

      if (this.actionData.oldTaskStatus && object.userData.taskData) {
        object.userData.taskData.status = this.actionData.oldTaskStatus;
        if (this.actionData.oldTaskStatus !== this.actionData.newTaskStatus) {
          this.animateTaskStatusUpdateFn?.(object);
          activityLogEntry = {
            timestamp: new Date().toISOString(),
            userId: this.socketInstance.id || 'system',
            action: 'Task status changed (undo)',
            details: `Status changed from '${this.actionData.newTaskStatus || 'Unknown'}' back to '${this.actionData.oldTaskStatus}'`
          };
          if (!object.userData.taskData.activityLog) {
            object.userData.taskData.activityLog = [];
          }
          object.userData.taskData.activityLog.push(activityLogEntry);
        }
      }

      this.socketInstance.emit('object-moved', {
        objectId: this.targetObjectId,
        position: this.actionData.oldPosition,
        rotation: this.actionData.oldRotation,
        scale: this.actionData.oldScale,
        userId: this.socketInstance.id,
        activityLogEntry
      });

      console.log(`[MoveCommand] Undone for ${this.targetObjectId}. Old Pos:`, this.actionData.oldPosition, `Old Status: ${this.actionData.oldTaskStatus || 'unchanged'}`);
    }
  }
}

class UpdateTaskPropertyCommandImpl implements Command<UpdateTaskPropertyCommandData> {
  private interactiveObjectsRef: React.MutableRefObject<THREE.Mesh[]>;
  private socket: Socket;
  public commandData: UpdateTaskPropertyCommandData;
  public description: string;
  private previousActivityLogLength: number | undefined;
  public actionType?: string;
  public actionData?: UpdateTaskPropertyCommandData;

  constructor(
    interactiveObjectsRef: React.MutableRefObject<THREE.Mesh[]>,
    socket: Socket,
    commandData: UpdateTaskPropertyCommandData,
    description: string
  ) {
    this.interactiveObjectsRef = interactiveObjectsRef;
    this.socket = socket;
    this.commandData = commandData;
    this.description = description;
    this.actionType = 'updateTaskProperty'; // Specific type for this command
    this.actionData = commandData;          // Store command data for potential use
  }

  execute(): void {
    const object = this.interactiveObjectsRef.current.find(obj => obj.userData.sharedId === this.commandData.objectId);
    if (object && object.userData.taskData) {
      const taskData = object.userData.taskData as TaskData;
      let logEntryDetails = '';
      let actionDescription = '';

      this.previousActivityLogLength = taskData.activityLog?.length ?? 0;

      if (this.commandData.property === 'taskTitle') {
        taskData.title = this.commandData.value as string;
        actionDescription = 'Task title updated';
        logEntryDetails = `Title changed from "${this.commandData.oldValue}" to "${this.commandData.value}"`;
      } else if (this.commandData.property === 'taskDescription') {
        taskData.description = this.commandData.value as string;
        actionDescription = 'Task description updated';
        logEntryDetails = `Description updated.`; // Could be more detailed if oldValue for description was also stored
      } else if (this.commandData.property === 'taskChecklistUpdate') {
        const checklistUpdate = this.commandData.value as ChecklistUpdateAction;
        const oldChecklist = this.commandData.oldValue as ChecklistItem[];
        actionDescription = 'Task checklist updated';

        if (checklistUpdate.action === 'add' && checklistUpdate.item) {
          taskData.checklist.push(checklistUpdate.item);
          logEntryDetails = `Added checklist item: "${checklistUpdate.item.text}"`;
        } else if (checklistUpdate.action === 'remove' && checklistUpdate.itemId) {
          const itemToRemove = oldChecklist.find(item => item.id === checklistUpdate.itemId);
          taskData.checklist = taskData.checklist.filter(item => item.id !== checklistUpdate.itemId);
          logEntryDetails = `Removed checklist item: "${itemToRemove?.text || checklistUpdate.itemId}"`;
        } else if (checklistUpdate.action === 'toggle' && checklistUpdate.itemId) {
          const itemToToggle = taskData.checklist.find(item => item.id === checklistUpdate.itemId);
          if (itemToToggle) {
            itemToToggle.completed = checklistUpdate.completed!;
            logEntryDetails = `Checklist item "${itemToToggle.text}" marked as ${itemToToggle.completed ? 'complete' : 'incomplete'}`;
          }
        } else if (checklistUpdate.action === 'editText' && checklistUpdate.itemId && checklistUpdate.newText !== undefined) {
          const itemToEdit = taskData.checklist.find(item => item.id === checklistUpdate.itemId);
          const originalText = oldChecklist.find(item => item.id === checklistUpdate.itemId)?.text;
          if (itemToEdit) {
            itemToEdit.text = checklistUpdate.newText;
            logEntryDetails = `Edited checklist item from "${originalText || 'previous text'}" to "${checklistUpdate.newText}"`;
          }
        }
      }

      const activityLogEntry: ActivityLogEntry = {
        timestamp: new Date().toISOString(),
        userId: this.commandData.userId,
        action: actionDescription,
        details: logEntryDetails,
      };
      if (!taskData.activityLog) taskData.activityLog = [];
      taskData.activityLog.push(activityLogEntry);

      this.socket.emit('object-property-updated', {
        objectId: this.commandData.objectId,
        property: this.commandData.property,
        value: this.commandData.value, // Send the new value or the checklist action
        userId: this.commandData.userId,
        activityLogEntry: activityLogEntry, // Send the specific log entry
      });
    }
  }

  undo(): void {
    const object = this.interactiveObjectsRef.current.find(obj => obj.userData.sharedId === this.commandData.objectId);
    if (object && object.userData.taskData) {
      const taskData = object.userData.taskData as TaskData;
      let logEntryDetails = '';
      let actionDescription = `Undo ${this.commandData.property} update`;

      if (this.commandData.property === 'taskTitle') {
        taskData.title = this.commandData.oldValue as string;
        actionDescription = 'Task title update undone';
        logEntryDetails = `Title reverted from "${this.commandData.value}" to "${this.commandData.oldValue}"`;
      } else if (this.commandData.property === 'taskDescription') {
        taskData.description = this.commandData.oldValue as string; // Assuming oldValue for description is also stored for undo
        actionDescription = 'Task description update undone';
        logEntryDetails = `Description reverted.`;
      } else if (this.commandData.property === 'taskChecklistUpdate') {
        // Reverting checklist requires setting it back to the old state.
        // The `oldValue` for checklist updates should be the entire checklist *before* the operation.
        taskData.checklist = [...(this.commandData.oldValue as ChecklistItem[])];
        actionDescription = 'Task checklist update undone';
        const checklistUpdate = this.commandData.value as ChecklistUpdateAction;
        logEntryDetails = `Checklist reverted to state before action: ${checklistUpdate.action}`;
      }

      // Remove the last log entry if it was added by this command's execute phase
      if (this.previousActivityLogLength !== undefined && taskData.activityLog && taskData.activityLog.length > this.previousActivityLogLength) {
        taskData.activityLog.pop();
      }
      // Optionally, add an 'undo' log entry
      const undoLogEntry: ActivityLogEntry = {
        timestamp: new Date().toISOString(),
        userId: this.commandData.userId,
        action: actionDescription,
        details: logEntryDetails,
      };
      if (!taskData.activityLog) taskData.activityLog = [];
      taskData.activityLog.push(undoLogEntry);

      this.socket.emit('object-property-updated', {
        objectId: this.commandData.objectId,
        property: this.commandData.property,
        value: this.commandData.oldValue, // Send the OLD value back for remote undo
        userId: this.commandData.userId,
        activityLogEntry: undoLogEntry, // Send the undo log entry
      });
    }
  }
}

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

const socket: Socket = io('http://localhost:3001'); // Allow Socket.IO to negotiate transport

// Debug listeners for Socket.IO client
socket.on("connect", () => {
  console.log("Socket.IO connected successfully:", socket.id);
});

socket.on("connect_error", (err: any) => { // Use err: any
  console.error("Socket.IO connect_error:", err);
  console.error(`Connect error message: ${err.message}`);
  if (err.data) {
    console.error("Connect error data:", err.data);
  }
  // Attempt to log other common properties for Socket.IO errors
  if (err.description) { // For Socket.IO v3+
    console.error("Connect error description:", err.description);
  }
  if (err.context) { // For Socket.IO v3+
    console.error("Connect error context:", err.context);
  }
});

socket.on("connect_timeout", (timeout: any) => {
  console.error("Socket.IO connect_timeout:", timeout);
});

socket.on("error", (err: any) => { // Use err: any
  console.error("Socket.IO error:", err);
  console.error(`Error message: ${err.message}`);
  if (err.data) {
    console.error("Error data:", err.data);
  }
});

socket.on("disconnect", (reason: string, description?: any) => { // reason as string, description as any
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

socket.on("reconnect_error", (err: any) => { // Use err: any
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


function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const interactiveObjects = useRef<THREE.Mesh[]>([]);
  const selectedObject = useRef<THREE.Mesh | null>(null);
  const originalMaterials = useRef(new Map<THREE.Object3D, THREE.Material | THREE.Material[]>());
  const isDraggingRef = useRef(false);
  const dragPlaneRef = useRef(new THREE.Plane());
  const offsetRef = useRef(new THREE.Vector3());
  const intersectionRef = useRef(new THREE.Vector3());
  const worldPosition = useRef(new THREE.Vector3());
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const nextObjectId = useRef(0);
  const [connectedUsers, setConnectedUsers] = useState<UserData[]>([]);
  const remoteCursorsRef = useRef(new Map<string, THREE.Mesh>());
  const groundPlaneRef = useRef<THREE.Plane>(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const listZonesRef = useRef<ListZone[]>([]);

  const undoStackRef = useRef<Command[]>([]);
  const redoStackRef = useRef<Command[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [currentSelectedObjectForPanel, setCurrentSelectedObjectForPanel] = useState<THREE.Mesh | null>(null);
  const currentSelectedObjectForPanelRef = useRef<THREE.Object3D | null>(null); 
  const initialDragStateRef = useRef<{
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
    taskStatus?: TaskData['status'];
  } | null>(null);

  const [showLandingPage, setShowLandingPage] = useState(true); // State to control landing page visibility

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
    command.execute();
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
        setCurrentSelectedObjectForPanel(null); // Force re-selection to trigger panel update
        setCurrentSelectedObjectForPanel(updatedObject);
      }
    }
    console.log(`[Undo] Executed & Recorded: ${command.description}. Undo: ${undoStackRef.current.length}, Redo: ${redoStackRef.current.length}`);
  }, [updateUndoRedoState]);

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length > 0) {
      const command = undoStackRef.current.pop()!;
      command.undo();
      redoStackRef.current.push(command);
      updateUndoRedoState();

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
          setCurrentSelectedObjectForPanel(null); 
          setCurrentSelectedObjectForPanel(updatedObject);
        }
      }
      console.log(`[Undo] Undone: ${command.description}. Undo: ${undoStackRef.current.length}, Redo: ${redoStackRef.current.length}`);
    }
  }, [updateUndoRedoState]);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length > 0) {
      const command = redoStackRef.current.pop()!;
      command.execute();
      undoStackRef.current.push(command);
      updateUndoRedoState();

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
          setCurrentSelectedObjectForPanel(null);
          setCurrentSelectedObjectForPanel(updatedObject);
        }
      }
      console.log(`[Undo] Redone: ${command.description}. Undo: ${undoStackRef.current.length}, Redo: ${redoStackRef.current.length}`);
    }
  }, [updateUndoRedoState]);

  // Handler to switch from LandingPage to the main app
  const handleEnterApp = () => {
    setShowLandingPage(false);
  };

  useEffect(() => {
    console.log('[Main Effect] Running. showLandingPage state:', showLandingPage);
    console.log('[Main Effect] mountRef.current:', mountRef.current);

    if (showLandingPage) {
      console.log('[Main Effect] Exiting early because showLandingPage is true.');
      return; // Exit if landing page is active
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
      scene.add(cube);
      interactiveObjects.current.push(cube);
      originalMaterials.current.set(cube, cubeMaterial.clone());

      const sphereGeometry = new THREE.SphereGeometry(0.75, 32, 32);
      const sphereMaterial = new THREE.MeshStandardMaterial({ color: 0xff4500, name: 'sphereMaterial' });
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      sphere.position.x = 0;
      sphere.userData.originalColor = new THREE.Color(0xff4500);
      sphere.userData.sharedId = 'shared_sphere';
      scene.add(sphere);
      interactiveObjects.current.push(sphere);
      originalMaterials.current.set(sphere, sphereMaterial.clone());

      const torusGeometry = new THREE.TorusGeometry(0.6, 0.2, 16, 100);
      const torusMaterial = new THREE.MeshStandardMaterial({ color: 0x28a745, name: 'torusMaterial' });
      const torus = new THREE.Mesh(torusGeometry, torusMaterial);
      torus.position.x = 2;
      torus.userData.originalColor = new THREE.Color(0x28a745);
      torus.userData.sharedId = 'shared_torus';
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

      socket.on('connect', () => {
        console.log('Connected to server with ID:', socket.id);
      });

      socket.on('disconnect', () => {
        console.log('Disconnected from server');
      });

      socket.on('server-event', (data) => {
        console.log('Received server-event:', data);
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
            const cursorGeometry = new THREE.ConeGeometry(0.05, 0.2, 8);
            const cursorMaterial = new THREE.MeshStandardMaterial({ color: user.color });
            cursorMesh = new THREE.Mesh(cursorGeometry, cursorMaterial);
            cursorMesh.name = `cursor-${user.id}`;
            cursorMesh.rotation.x = Math.PI;
            sceneRef.current?.add(cursorMesh);
            remoteCursorsRef.current.set(user.id, cursorMesh);
            console.log(`[Client ${socket.id?.substring(0,5)}] Created cursor for ${user.id}`);
          } else {
            if (cursorMesh.material instanceof THREE.MeshStandardMaterial) {
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

      socket.on('object-updated', (data: { objectId: string, position: { x: number, y: number, z: number }, rotation: { x: number, y: number, z: number, order?: THREE.EulerOrder }, scale: { x: number, y: number, z: number } }) => {
        const objectToUpdate = interactiveObjects.current.find(obj => obj.userData.sharedId === data.objectId);
        if (!objectToUpdate) return;
        if (objectToUpdate.userData.sharedId !== selectedObject.current?.userData.sharedId || !isDraggingRef.current) {
          objectToUpdate.position.set(data.position.x, data.position.y, data.position.z);
          objectToUpdate.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z, data.rotation.order || 'XYZ');
          if (data.scale) {
            gsap.to(objectToUpdate.scale, {
              x: data.scale.x, y: data.scale.y, z: data.scale.z, duration: 0.2, ease: 'power2.out'
            });
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

      socket.on('object-property-updated', (data: ObjectPropertyUpdateData) => {
        const objectToUpdate = interactiveObjects.current.find(obj => obj.userData.sharedId === data.objectId);
        if (objectToUpdate) {
          let panelNeedsRefresh = false;
          const taskData = objectToUpdate.userData.taskData as TaskData | undefined;

          // Ensure activityLog exists
          if (taskData && !taskData.activityLog) {
            taskData.activityLog = [];
          }

          if (data.property === 'color' && typeof data.value === 'string' && objectToUpdate.material instanceof THREE.MeshStandardMaterial) {
            objectToUpdate.material.color.set(data.value);
            objectToUpdate.userData.originalColor = new THREE.Color(data.value);
            panelNeedsRefresh = true;
            if (taskData && data.userId) {
              taskData.activityLog.push(data.activityLogEntry || {
                timestamp: new Date().toISOString(),
                userId: data.userId,
                action: 'Color updated',
                details: `Color changed to ${data.value}`
              });
            }
          } else if (data.property === 'scale' && typeof data.value === 'object' && data.value !== null && 'x' in data.value && 'y' in data.value && 'z' in data.value) {
            objectToUpdate.scale.set(data.value.x, data.value.y, data.value.z);
            panelNeedsRefresh = true;
            if (taskData && data.userId) {
              taskData.activityLog.push(data.activityLogEntry || {
                timestamp: new Date().toISOString(),
                userId: data.userId,
                action: 'Scale updated',
                details: `Scale changed to X:${data.value.x}, Y:${data.value.y}, Z:${data.value.z}`
              });
            }
          } else if (taskData && data.property === 'taskTitle' && typeof data.value === 'string') {
            const oldTitle = taskData.title;
            taskData.title = data.value;
            panelNeedsRefresh = true;
            if (data.userId) {
              taskData.activityLog.push(data.activityLogEntry || {
                timestamp: new Date().toISOString(),
                userId: data.userId,
                action: 'Task title updated',
                details: `Title changed from "${oldTitle}" to "${data.value}"`
              });
            }
          } else if (taskData && data.property === 'taskDescription' && typeof data.value === 'string') {
            taskData.description = data.value;
            panelNeedsRefresh = true;
            if (data.userId) {
              taskData.activityLog.push(data.activityLogEntry || {
                timestamp: new Date().toISOString(),
                userId: data.userId,
                action: 'Task description updated',
                details: 'Description updated'
              });
            }
          } else if (taskData && data.property === 'taskStatus' && typeof data.value === 'string') {
            const oldStatus = taskData.status;
            const newStatus = data.value as TaskData['status'];
            if (taskData.status !== newStatus) {
              taskData.status = newStatus;
              animateTaskStatusUpdate(objectToUpdate);
              if (data.userId) {
                // If an activityLogEntry is provided with the event, use it directly
                // This is typically the case for status changes from MoveObjectCommandImpl
                if (data.activityLogEntry) {
                  taskData.activityLog.push(data.activityLogEntry);
                } else {
                   taskData.activityLog.push({
                    timestamp: new Date().toISOString(),
                    userId: data.userId,
                    action: 'Task status updated',
                    details: `Status changed from '${oldStatus}' to '${newStatus}'`
                  });
                }
              }
            }
            panelNeedsRefresh = true;
          } else if (taskData && data.property === 'taskChecklistUpdate' && typeof data.value === 'object') {
            const checklistUpdate = data.value as ChecklistUpdateAction;
            let itemTextForLog = '';

            // Ensure activityLog exists on taskData, if not already
            if (!taskData.activityLog) {
              taskData.activityLog = [];
            }

            if (checklistUpdate.action === 'add') {
              if (checklistUpdate.item) { // Explicitly check if item exists
                // Avoid adding duplicate if already exists from local execution
                if (!taskData.checklist.find(i => i.id === checklistUpdate.item!.id)) {
                  taskData.checklist.push(checklistUpdate.item);
                  itemTextForLog = checklistUpdate.item.text;
                }
              } else {
                console.warn('[Socket object-property-updated] Checklist add action received without item data.');
              }
            } else if (checklistUpdate.action === 'remove' && checklistUpdate.itemId) {
              const itemToRemove = taskData.checklist.find(i => i.id === checklistUpdate.itemId);
              if (itemToRemove) itemTextForLog = itemToRemove.text;
              taskData.checklist = taskData.checklist.filter(item => item.id !== checklistUpdate.itemId);
            } else if (checklistUpdate.action === 'toggle' && checklistUpdate.itemId && typeof checklistUpdate.completed === 'boolean') {
              const itemToToggle = taskData.checklist.find(item => item.id === checklistUpdate.itemId);
              if (itemToToggle) {
                itemToToggle.completed = checklistUpdate.completed;
                itemTextForLog = itemToToggle.text;
              }
            } else if (checklistUpdate.action === 'editText' && checklistUpdate.itemId && typeof checklistUpdate.newText === 'string') {
              const itemToEdit = taskData.checklist.find(item => item.id === checklistUpdate.itemId);
              if (itemToEdit) {
                itemTextForLog = `from "${itemToEdit.text}" to "${checklistUpdate.newText}"`;
                itemToEdit.text = checklistUpdate.newText;
              }
            }
            panelNeedsRefresh = true;
            if (data.userId) {
               // Use provided log entry if available, otherwise generate one
              if (data.activityLogEntry) {
                // Check for duplicate log entry before pushing
                const logExists = taskData.activityLog.some(entry => 
                  entry.timestamp === data.activityLogEntry!.timestamp && 
                  entry.userId === data.activityLogEntry!.userId &&
                  entry.action === data.activityLogEntry!.action &&
                  entry.details === data.activityLogEntry!.details
                );
                if (!logExists) {
                  taskData.activityLog.push(data.activityLogEntry);
                }
              } else {
                taskData.activityLog.push({
                  timestamp: new Date().toISOString(),
                  userId: data.userId,
                  action: `Checklist ${checklistUpdate.action}`,
                  details: itemTextForLog || checklistUpdate.itemId
                });
              }
            }
          }

          if (panelNeedsRefresh) {
            if (currentSelectedObjectForPanelRef.current && currentSelectedObjectForPanelRef.current.userData.sharedId === data.objectId) {
              // Force a refresh of the PropertiesPanel by re-setting the selected object
              setCurrentSelectedObjectForPanel(null); 
              setCurrentSelectedObjectForPanel(objectToUpdate);
            }
          }
        }
      });

      socket.on('cursor-updated', (data: CursorUpdateData) => {
        if (data.userId === socket.id) return;
        const cursorMesh = remoteCursorsRef.current.get(data.userId);
        if (cursorMesh) {
          gsap.to(cursorMesh.position, {
            x: data.position.x, y: data.position.y + 0.1, z: data.position.z, duration: 0.1, ease: 'linear'
          });
        }
      });

      socket.on('user-cursor-removed', (data: { userId: string }) => {
        const cursorToRemove = remoteCursorsRef.current.get(data.userId);
        if (cursorToRemove) {
          sceneRef.current?.remove(cursorToRemove);
          cursorToRemove.geometry.dispose();
          if (cursorToRemove.material instanceof THREE.Material) cursorToRemove.material.dispose();
          remoteCursorsRef.current.delete(data.userId);
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
        
        if (setupAttempted) { 
          console.log('[Main Effect] Proceeding with full cleanup of resources.');
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
          window.removeEventListener('resize', handleResize);

          if (capturedRenderer && capturedRenderer.domElement) {
            capturedRenderer.domElement.removeEventListener('pointerdown', onPointerDown);
            capturedRenderer.domElement.removeEventListener('pointermove', onPointerMove);
            capturedRenderer.domElement.removeEventListener('pointerup', onPointerUp);
          }
          window.removeEventListener('pointerup', onPointerUp);

          if (mountRef.current && capturedRenderer && capturedRenderer.domElement) {
            mountRef.current.removeChild(capturedRenderer.domElement);
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
              mat.forEach(m => m.dispose());
            } else {
              mat.dispose();
            }
          });
          capturedOriginalMaterials.clear();

          capturedRemoteCursors.forEach(cursor => {
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
  }, [showLandingPage, recordAndExecuteCommand, updateUndoRedoState, handleUndo, handleRedo, animateTaskStatusUpdate]);

  const handleCreateObject = (type: 'cube' | 'sphere' | 'torus') => {
    if (!sceneRef.current) return;
    const objectIdSuffix = nextObjectId.current++; 
    const sharedId = `task_${type}_${objectIdSuffix}`;
    const color = Math.random() * 0xffffff;
    const toDoZone = listZonesRef.current.find(zone => zone.name === 'To Do');
    const position = toDoZone
      ? { x: toDoZone.position.x + (Math.random() - 0.5) * toDoZone.size.width * 0.8,
          y: 0.5, 
          z: toDoZone.position.z + (Math.random() - 0.5) * toDoZone.size.depth * 0.8 }
      : { x: Math.random() * 4 - 2, y: 0.5, z: Math.random() * 4 - 2 };

    const initialLogEntry: ActivityLogEntry = {
      timestamp: new Date().toISOString(),
      userId: socket.id || 'system', // Use socket.id or a placeholder if not available
      action: 'Task created',
      details: `Task of type '${type}' created with title 'New ${type.charAt(0).toUpperCase() + type.slice(1)} Task ${objectIdSuffix + 1}'`
    };

    const taskData: TaskData = {
      title: `New ${type.charAt(0).toUpperCase() + type.slice(1)} Task ${objectIdSuffix + 1}`,
      status: 'To Do',
      description: '',
      checklist: [],
      activityLog: [initialLogEntry]
    };

    const defaultRotation = { x: 0, y: 0, z: 0, order: 'XYZ' as THREE.EulerOrder };
    const defaultScale = { x: 1, y: 1, z: 1 };

    const commandData: CreateObjectCommandData = {
      sharedId,
      type,
      position,
      color,
      taskData,
      rotation: defaultRotation,
      scale: defaultScale,
    };

    const createCommand = new CreateObjectCommandImpl(
      sceneRef,
      interactiveObjects,
      originalMaterials,
      socket,
      commandData,
      `Create ${type} ${sharedId}`
    );
    recordAndExecuteCommand(createCommand);

    // Animate the new object scaling in
    requestAnimationFrame(() => {
      const newObject = interactiveObjects.current.find(obj => obj.userData.sharedId === sharedId);
      if (newObject) {
        const originalScale = { x: 1, y: 1, z: 1 }; 
        newObject.scale.set(0.01, 0.01, 0.01); 
        gsap.to(newObject.scale, {
          x: originalScale.x,
          y: originalScale.y,
          z: originalScale.z,
          duration: 0.5,
          ease: 'back.out(1.7)',
          delay: 0.05 
        });
      }
    });
  };

  const handleDeleteSelectedObject = () => {
    if (!selectedObject.current || !sceneRef.current) return;
    const objectToDelete = selectedObject.current;
    const { sharedId, originalColor, taskData, objectType } = objectToDelete.userData;

    if (!sharedId) return;

    const typeForCommand = objectType || 'cube'; 

    const currentTaskData: TaskData = {
      title: taskData?.title || sharedId,
      status: taskData?.status || 'To Do',
      description: taskData?.description || '',
      checklist: taskData?.checklist || [],
      activityLog: taskData?.activityLog || []
    };

    const commandData: DeleteObjectCommandData = {
      sharedId,
      type: typeForCommand as 'cube' | 'sphere' | 'torus',
      position: { x: objectToDelete.position.x, y: objectToDelete.position.y, z: objectToDelete.position.z },
      rotation: { x: objectToDelete.rotation.x, y: objectToDelete.rotation.y, z: objectToDelete.rotation.z, order: objectToDelete.rotation.order },
      scale: { x: objectToDelete.scale.x, y: objectToDelete.scale.y, z: objectToDelete.scale.z },
      color: originalColor ? originalColor.getHex() : 0xffffff, 
      taskData: currentTaskData, 
    };

    const deleteCommand = new DeleteObjectCommandImpl(
      sceneRef,
      interactiveObjects,
      originalMaterials,
      socket,
      selectedObject, 
      setCurrentSelectedObjectForPanel,
      commandData,
      `Delete ${sharedId}`
    );
    recordAndExecuteCommand(deleteCommand);
  };

  // Main return statement
  if (showLandingPage) {
    return <LandingPage onEnterApp={handleEnterApp} />;
  }

  return (
    <>
      <div ref={mountRef} style={{ width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0 }} />
      {/* Pass recordAndExecuteCommand to PropertiesPanel for it to initiate commands */}
      <PropertiesPanel 
        selectedObject={currentSelectedObjectForPanel} 
        socket={socket} 
        recordCommand={recordAndExecuteCommand} 
      />
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        zIndex: 100,
        background: 'rgba(0,0,0,0.5)',
        padding: '10px',
        borderRadius: '5px',
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: '5px' 
      }}>
        <button onClick={handleUndo} disabled={!canUndo}>Undo</button>
        <button onClick={handleRedo} disabled={!canRedo}>Redo</button>
        <button onClick={() => handleCreateObject('cube')}>Create Cube Task</button>
        <button onClick={() => handleCreateObject('sphere')}>Create Sphere Task</button>
        <button onClick={() => handleCreateObject('torus')}>Create Torus Task</button>
        <button onClick={handleDeleteSelectedObject} disabled={!selectedObject.current} style={{ marginTop: 'auto' }}>Delete Selected</button>
      </div>
      <div style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        zIndex: 100,
        background: 'rgba(0,0,0,0.5)',
        padding: '10px',
        borderRadius: '5px',
        color: 'white'
      }}>
        <p>Connected Users:</p>
        <ul>
          {connectedUsers.map(user => (
            <li key={user.id} style={{ color: user.color }}>
              {user.id === socket.id ? `${user.id.substring(0,5)}... (You)` : `${user.id.substring(0,5)}...`}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

export default App;
