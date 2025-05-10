import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import io, { Socket } from 'socket.io-client';
import './App.css';
import PropertiesPanel from './components/PropertiesPanel';

interface ObjectPropertyUpdateData {
  objectId: string;
  property: string;
  value: string | { x: number; y: number; z: number };
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

interface Command<TActionData = unknown> {
  execute: () => void;
  undo: () => void;
  description: string;
  actionType: string;
  actionData: TActionData;
  targetObjectId?: string;
}

interface MoveObjectCommandData {
  objectId: string;
  oldPosition: { x: number; y: number; z: number };
  newPosition: { x: number; y: number; z: number };
  oldRotation: { x: number; y: number; z: number; order: THREE.EulerOrder };
  newRotation: { x: number; y: number; z: number; order: THREE.EulerOrder };
  oldScale: { x: number; y: number; z: number };
  newScale: { x: number; y: number; z: number };
}

class MoveObjectCommandImpl implements Command<MoveObjectCommandData> {
  public actionType = 'move';
  public targetObjectId: string;
  public description: string;
  public actionData: MoveObjectCommandData;

  private interactiveObjectsRef: React.MutableRefObject<THREE.Mesh[]>;
  private socketInstance: Socket;

  constructor(
    interactiveObjectsRef: React.MutableRefObject<THREE.Mesh[]>,
    socketInstance: Socket,
    actionData: MoveObjectCommandData,
    description: string
  ) {
    this.interactiveObjectsRef = interactiveObjectsRef;
    this.socketInstance = socketInstance;
    this.actionData = actionData;
    this.description = description;
    this.targetObjectId = actionData.objectId;
  }

  private applyState(
    pos: { x: number; y: number; z: number },
    rot: { x: number; y: number; z: number; order: THREE.EulerOrder },
    scaleVal: { x: number; y: number; z: number }
  ) {
    const object = this.interactiveObjectsRef.current.find(obj => obj.userData.sharedId === this.targetObjectId);
    if (object) {
      object.position.set(pos.x, pos.y, pos.z);
      object.rotation.set(rot.x, rot.y, rot.z, rot.order);
      object.scale.set(scaleVal.x, scaleVal.y, scaleVal.z);
      return object;
    }
    return null;
  }

  execute(): void {
    const object = this.applyState(this.actionData.newPosition, this.actionData.newRotation, this.actionData.newScale);
    if (object) {
      this.socketInstance.emit('object-moved', {
        objectId: this.targetObjectId,
        position: this.actionData.newPosition,
        rotation: this.actionData.newRotation,
        scale: this.actionData.newScale,
      });
      console.log(`[MoveCommand] Executed for ${this.targetObjectId}. New Pos:`, this.actionData.newPosition);
    }
  }

  undo(): void {
    const object = this.applyState(this.actionData.oldPosition, this.actionData.oldRotation, this.actionData.oldScale);
    if (object) {
      this.socketInstance.emit('object-moved', {
        objectId: this.targetObjectId,
        position: this.actionData.oldPosition,
        rotation: this.actionData.oldRotation,
        scale: this.actionData.oldScale,
      });
      console.log(`[MoveCommand] Undone for ${this.targetObjectId}. Old Pos:`, this.actionData.oldPosition);
    }
  }
}

const socket: Socket = io('http://localhost:3001');

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

  const undoStackRef = useRef<Command[]>([]);
  const redoStackRef = useRef<Command[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [currentSelectedObjectForPanel, setCurrentSelectedObjectForPanel] = useState<THREE.Mesh | null>(null); // Added for PropertiesPanel
  const initialDragStateRef = useRef<{
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
  } | null>(null);

  const updateUndoRedoState = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  const recordAndExecuteCommand = useCallback((command: Command) => {
    command.execute();
    undoStackRef.current.push(command);
    redoStackRef.current = [];
    updateUndoRedoState();
    console.log(`[Undo] Executed & Recorded: ${command.description}. Undo: ${undoStackRef.current.length}, Redo: ${redoStackRef.current.length}`);
  }, [updateUndoRedoState]);

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length > 0) {
      const command = undoStackRef.current.pop()!;
      command.undo();
      redoStackRef.current.push(command);
      updateUndoRedoState();
      console.log(`[Undo] Undone: ${command.description}. Undo: ${undoStackRef.current.length}, Redo: ${redoStackRef.current.length}`);
    }
  }, [updateUndoRedoState]);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length > 0) {
      const command = redoStackRef.current.pop()!;
      command.execute();
      undoStackRef.current.push(command);
      updateUndoRedoState();
      console.log(`[Undo] Redone: ${command.description}. Undo: ${undoStackRef.current.length}, Redo: ${redoStackRef.current.length}`);
    }
  }, [updateUndoRedoState]);

  useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeeeeee);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    cameraRef.current = camera;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    rendererRef.current = renderer;
    renderer.setSize(window.innerWidth, window.innerHeight);
    currentMount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 2;
    controls.maxDistance = 10;

    // Initialize/reset refs holding collections at the start of the effect
    interactiveObjects.current = [];
    originalMaterials.current = new Map<THREE.Object3D, THREE.Material | THREE.Material[]>();
    remoteCursorsRef.current = new Map<string, THREE.Mesh>();


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

    // Listen for user list updates
    socket.on('user-list-updated', (incomingUsers: UserData[]) => { // Renamed 'users' to 'incomingUsers'
      console.log('Received user-list-updated:', incomingUsers);

      // Filter out users with undefined/null/empty id, and provide default color if necessary
      const validUsers = incomingUsers
        .filter(user => user && typeof user.id === 'string' && user.id.trim() !== '')
        .map(user => ({
          ...user,
          color: (typeof user.color === 'string' && user.color.trim() !== '') ? user.color : '#CCCCCC', // Default color
        }));

      setConnectedUsers(validUsers);

      if (!sceneRef.current) return;

      const currentRemoteUserIds = new Set(remoteCursorsRef.current.keys());
      const validUserIdsFromServer = new Set(validUsers.map(u => u.id));

      // Add/Update cursors for valid users
      validUsers.forEach(user => { // user.id and user.color are now guaranteed to be valid
        if (user.id === socket.id) return; // Don't create a cursor for the local user

        let cursorMesh = remoteCursorsRef.current.get(user.id);
        if (!cursorMesh) {
          const cursorGeometry = new THREE.ConeGeometry(0.05, 0.2, 8);
          const cursorMaterial = new THREE.MeshStandardMaterial({ color: user.color });
          cursorMesh = new THREE.Mesh(cursorGeometry, cursorMaterial);
          cursorMesh.name = `cursor-${user.id}`;
          cursorMesh.rotation.x = Math.PI; // Point cone downwards
          sceneRef.current?.add(cursorMesh);
          remoteCursorsRef.current.set(user.id, cursorMesh);
          console.log(`[Client ${socket.id?.substring(0,5)}] Created cursor for ${user.id}`);
        } else {
          // Optionally update color if it can change
          if (cursorMesh.material instanceof THREE.MeshStandardMaterial) {
            cursorMesh.material.color.set(user.color);
          }
        }
      });

      // Remove old cursors for users no longer in the valid list
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

    socket.on('object-created', (data: { sharedId: string, type: string, position: { x: number, y: number, z: number }, color: number }) => {
      if (!sceneRef.current || interactiveObjects.current.find(obj => obj.userData.sharedId === data.sharedId)) return;
      let newObjectGeometry: THREE.BufferGeometry;
      if (data.type === 'cube') newObjectGeometry = new THREE.BoxGeometry(1, 1, 1);
      else if (data.type === 'sphere') newObjectGeometry = new THREE.SphereGeometry(0.75, 32, 32);
      else if (data.type === 'torus') newObjectGeometry = new THREE.TorusGeometry(0.6, 0.2, 16, 100);
      else return;
      const newObjectMaterial = new THREE.MeshStandardMaterial({ color: data.color });
      const newObject = new THREE.Mesh(newObjectGeometry, newObjectMaterial);
      newObject.position.set(data.position.x, data.position.y, data.position.z);
      newObject.userData.sharedId = data.sharedId;
      newObject.userData.originalColor = new THREE.Color(data.color);
      sceneRef.current.add(newObject);
      interactiveObjects.current.push(newObject);
      originalMaterials.current.set(newObject, newObjectMaterial.clone());
    });

    socket.on('object-deleted', (data: { objectId: string }) => {
      if (!sceneRef.current) return;
      const objectToDelete = interactiveObjects.current.find(obj => obj.userData.sharedId === data.objectId);
      if (objectToDelete) {
        sceneRef.current.remove(objectToDelete);
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
        if (data.property === 'color' && typeof data.value === 'string' && objectToUpdate.material instanceof THREE.MeshStandardMaterial) {
          objectToUpdate.material.color.set(data.value);
        } else if (data.property === 'scale' && typeof data.value === 'object') {
          const scaleValue = data.value as { x: number, y: number, z: number }; 
          if (selectedObject.current?.userData.sharedId !== data.objectId || !isDraggingRef.current) {
            gsap.to(objectToUpdate.scale, {
              x: scaleValue.x, y: scaleValue.y, z: scaleValue.z, duration: 0.2, ease: 'power2.out'
            });
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
        setCurrentSelectedObjectForPanel(firstIntersectedObject); // Update state for PropertiesPanel

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
          setCurrentSelectedObjectForPanel(null); // Update state for PropertiesPanel
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
        if (selectedObject.current.userData.sharedId) {
          const oldState = initialDragStateRef.current;
          const currentObj = selectedObject.current;
          const commandData: MoveObjectCommandData = {
            objectId: currentObj.userData.sharedId,
            oldPosition: { x: oldState.position.x, y: oldState.position.y, z: oldState.position.z },
            newPosition: { x: currentObj.position.x, y: currentObj.position.y, z: currentObj.position.z },
            oldRotation: { x: oldState.rotation.x, y: oldState.rotation.y, z: oldState.rotation.z, order: oldState.rotation.order },
            newRotation: { x: currentObj.rotation.x, y: currentObj.rotation.y, z: currentObj.rotation.z, order: currentObj.rotation.order },
            oldScale: { x: oldState.scale.x, y: oldState.scale.y, z: oldState.scale.z },
            newScale: { x: currentObj.scale.x, y: currentObj.scale.y, z: currentObj.scale.z },
          };
          const posChanged = !oldState.position.equals(currentObj.position);
          const rotChanged = !oldState.rotation.equals(currentObj.rotation);
          const scaleChanged = !oldState.scale.equals(currentObj.scale);
          if (posChanged || rotChanged || scaleChanged) {
            const moveCommand = new MoveObjectCommandImpl(interactiveObjects, socket, commandData, `Move ${currentObj.userData.sharedId}`);
            recordAndExecuteCommand(moveCommand);
          }
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

    // Capture .current values of refs that hold mutable objects for cleanup
    const capturedRenderer = rendererRef.current;
    const capturedInteractiveObjects = [...interactiveObjects.current]; 
    const capturedOriginalMaterials = originalMaterials.current; 
    const capturedRemoteCursors = remoteCursorsRef.current;

    return () => {
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

      if (currentMount && capturedRenderer && capturedRenderer.domElement) {
        currentMount.removeChild(capturedRenderer.domElement);
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

      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      interactiveObjects.current = [];
      originalMaterials.current = new Map(); // Reset to new Map
      remoteCursorsRef.current = new Map();   // Reset to new Map
      undoStackRef.current = [];
      redoStackRef.current = [];
    };
  }, [recordAndExecuteCommand, updateUndoRedoState, handleUndo, handleRedo]);

  const handleCreateObject = (type: 'cube' | 'sphere' | 'torus') => {
    if (!sceneRef.current) return;
    const objectIdSuffix = nextObjectId.current++;
    const sharedId = `dynamic_${type}_${objectIdSuffix}`;
    const color = Math.random() * 0xffffff;
    const position = {
      x: Math.random() * 4 - 2,
      y: Math.random() * 2,
      z: Math.random() * 4 - 2
    };
    let newGeometry: THREE.BufferGeometry;
    if (type === 'cube') newGeometry = new THREE.BoxGeometry(1, 1, 1);
    else if (type === 'sphere') newGeometry = new THREE.SphereGeometry(0.75, 32, 32);
    else if (type === 'torus') newGeometry = new THREE.TorusGeometry(0.6, 0.2, 16, 100);
    else return;
    const newMaterial = new THREE.MeshStandardMaterial({ color });
    const newObject = new THREE.Mesh(newGeometry, newMaterial);
    newObject.position.set(position.x, position.y, position.z);
    newObject.userData.sharedId = sharedId;
    newObject.userData.originalColor = new THREE.Color(color);
    sceneRef.current.add(newObject);
    interactiveObjects.current.push(newObject);
    originalMaterials.current.set(newObject, newMaterial.clone());
    socket.emit('request-create-object', { sharedId, type, position, color });
  };

  const handleDeleteSelectedObject = () => {
    if (!selectedObject.current || !sceneRef.current) return;
    const objectToDelete = selectedObject.current;
    const { sharedId } = objectToDelete.userData;
    if (!sharedId) return;
    sceneRef.current.remove(objectToDelete);
    interactiveObjects.current = interactiveObjects.current.filter(obj => obj.userData.sharedId !== sharedId);
    originalMaterials.current.delete(objectToDelete);
    selectedObject.current = null;
    setCurrentSelectedObjectForPanel(null); // Update state for PropertiesPanel
    socket.emit('request-delete-object', { objectId: sharedId });
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <div ref={mountRef} className="App" style={{ width: '100%', height: '100%', overflow: 'hidden' }}></div>
      <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: '100', display: 'flex', gap: '10px' }}>
        <button onClick={() => handleCreateObject('cube')} style={{ padding: '10px', fontSize: '16px' }}>Add Cube</button>
        <button onClick={() => handleCreateObject('sphere')} style={{ padding: '10px', fontSize: '16px' }}>Add Sphere</button>
        <button onClick={() => handleCreateObject('torus')} style={{ padding: '10px', fontSize: '16px' }}>Add Torus</button>
        <button onClick={handleDeleteSelectedObject} style={{ padding: '10px', fontSize: '16px' }} disabled={!selectedObject.current}>
          Delete Selected
        </button>
        <button onClick={handleUndo} disabled={!canUndo} style={{ padding: '10px', fontSize: '16px' }}>Undo</button>
        <button onClick={handleRedo} disabled={!canRedo} style={{ padding: '10px', fontSize: '16px' }}>Redo</button>
      </div>
      <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 100, background: 'rgba(255,255,255,0.7)', padding: '10px', borderRadius: '5px' }}>
        <h4>Connected Users:</h4>
        {connectedUsers.length > 0 ? (
          <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
            {connectedUsers.map(user => {
              if (!user || user.id === undefined || user.color === undefined) return null;
              return (
                <li key={user.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                  <span style={{
                    display: 'inline-block', width: '12px', height: '12px', backgroundColor: user.color,
                    borderRadius: '50%', marginRight: '8px', border: '1px solid #333'
                  }}></span>
                  {user.id === socket.id ? `${user.id.substring(0,5)}... (You)` : `${user.id.substring(0,5)}...`}
                </li>
              );
            })}
          </ul>
        ) : (
          <p>No other users connected.</p>
        )}
      </div>
      <PropertiesPanel selectedObject={currentSelectedObjectForPanel} socket={socket} />
    </div>
  );
}

export default App;
