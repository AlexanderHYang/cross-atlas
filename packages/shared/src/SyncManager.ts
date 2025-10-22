import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { IPoint } from './IPoint'
import { IPointManager } from './IPointManager'

export type Vector3SyncData = { x: number, y: number, z: number }

export type PointSyncData = {
    id: string,
    position: Vector3SyncData,
}

export class SyncManager {
    ydoc = new Y.Doc()
    provider: WebsocketProvider
    syncedPointDataMap = this.ydoc.getMap('points') as Y.Map<PointSyncData>
    localPointsById = new Map<string, IPoint>()
    
    constructor(wsUrl = 'ws://localhost:1234', room = 'proj-room') {
        this.provider = new WebsocketProvider(wsUrl, room, this.ydoc)

        // observe remote changes and apply
        this.syncedPointDataMap.observe((event, transaction) => {
            for (const key of event.keysChanged) {
                const remoteData = this.syncedPointDataMap.get(key)
                const p = this.localPointsById.get(key)
                if (!p) continue
                // console.log('Remote change on', key, remoteData, 'origin:', transaction.origin)
                // skip changes originated from this local point update
                if (transaction.origin === p) continue
                p.ignoreRemote = true
                p.applyRemoteData(remoteData!)
                p.ignoreRemote = false
            }
        })
    }
    
    registerPoint(p: IPoint) {
        console.log('Registering point', p.id)
        this.localPointsById.set(p.id, p)
        
        // if remote exists, apply it without re-emitting
        const remote = this.syncedPointDataMap.get(p.id)
        if (remote) {
            p.ignoreRemote = true
            p.applyRemoteData(remote)
            p.ignoreRemote = false
        } else {
            // first writer writes initial state
            this.ydoc.transact(() => {
                this.syncedPointDataMap.set(p.id, p.getLocalData())
            }, p)
        }
        
        // subscribe local->remote
        p.onLocalChange = () => {
            if (p.ignoreRemote) return
            // console.log('Local change on', p.id)
            const localData = p.getLocalData();
            // write with origin so the observer can ignore this local change
            this.ydoc.transact(() => {
                this.syncedPointDataMap.set(p.id, localData)
            }, p)
        }
    }

    getLocalPointDataArray(): PointSyncData[] {
        const arr: PointSyncData[] = []
        for (const p of this.localPointsById.values()) {
            arr.push(p.getLocalData())
        }
        return arr
    }
    
}