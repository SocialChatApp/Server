import { Injectable } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';

import { Server, Socket } from 'socket.io';
import { User } from './dto/User';

@WebSocketGateway({
    cors: {
        origin: '*',
    }
})
@Injectable()
export class ChatService implements OnGatewayConnection, OnGatewayDisconnect {

    private userRooms: Map<string, { userInfo: User; rooms: Set<string> }> = new Map();

    @WebSocketServer() server: Server;

    handleConnection(client: Socket) {
        console.log('Client connected:', client.id);
        this.userRooms.set(client.id, { userInfo: { name: '', avatarUrl: '' }, rooms: new Set() });
    }


    handleDisconnect(client: Socket) {
        console.log('Client disconnected:', client.id);
        const user = this.userRooms.get(client.id);

        if (user) {
            const rooms = Array.from(user.rooms);

            for (const roomName of rooms) {
                client.leave(roomName);
                this.SendRoomInfoToBroadcast(roomName);
            }

            this.userRooms.delete(client.id);
        }

        this.server.emit("roomList", this.fetchActiveRooms());
    }


    @SubscribeMessage('setUserInfo')
    handleSetUserInfo(client: Socket, userInfo: User): void {
        const user = this.userRooms.get(client.id);
        if (user) {
            user.userInfo = userInfo;
        }
    }

    @SubscribeMessage('getRooms')
    handleGetRooms(client: Socket): void {
        client.emit('roomList', this.fetchActiveRooms());
    }

    @SubscribeMessage('createRoom')
    handleCreateRoom(client: Socket, roomName: string): void {

        this.handleJoinRoom(client, roomName);

        console.log("Client joined" + client.id);
        this.server.emit("roomList", this.fetchActiveRooms());

        this.SendRoomInfo(client.id, roomName);
    }

    @SubscribeMessage('joinRoom')
    handleJoinRoom(client: Socket, roomName: string): void {

        const user = this.userRooms.get(client.id);
        if (!user) return;

        client.join(roomName);
        user.rooms.add(roomName);
        this.SendRoomInfo(client.id, roomName);
        this.server.to(roomName).emit('NewUserJoined', { ...user.userInfo, id: client.id });
    }


    @SubscribeMessage('leave-room')
    handleLeaveRoom(client: Socket, roomName: string): void {

        client.leave(roomName);
        const user = this.userRooms.get(client.id);

        if (user) {
            this.server.to(roomName).emit('user-left', client.id);
            user.rooms.delete(roomName);
        }

        this.server.emit("roomList", this.fetchActiveRooms());
        this.SendRoomInfoToBroadcast(roomName);
    }

    @SubscribeMessage('message')
    handleMessage(client: Socket, payload: { roomName: string, sender: string, avatarUrl: string, message: string }): void {
        this.server.to(payload.roomName).emit('message', {
            sender: payload.sender,
            avatarUrl: payload.avatarUrl,
            message: payload.message
        })
    }


    SendRoomInfo(socketId: string, roomName: string) {
        const users = this.getAllUsers(roomName);
        const userInfos = Array.from(users).map(userId => this.userRooms.get(userId)?.userInfo).filter(Boolean);

        const roomInfo = {
            roomName,
            users: userInfos,
        };

        this.server.to(socketId).emit('roomInfo', roomInfo);
    }

    SendRoomInfoToBroadcast(roomName: string) {
        const users = this.getAllUsers(roomName);
        const userInfos = Array.from(users).map(userId => this.userRooms.get(userId)?.userInfo).filter(Boolean);

        const roomInfo = {
            roomName,
            users: userInfos,
        };

        this.server.to(roomName).emit('roomInfo', roomInfo);
    }


    fetchActiveRooms(): string[] {
        const roomsMap = this.server.of("/").adapter.rooms;
        const roomsArray = Array.from(roomsMap.keys());
        const sids = this.server.of("/").adapter.sids;
        const filteredRoomsArray = roomsArray.filter(room => !sids.has(room));
        return filteredRoomsArray;
    }

    getAllUsers(roomName: string): string[] {

        const room = this.server.of("/").adapter.rooms.get(roomName);
        if (!room) {
            return [];
        }

        const users: string[] = [];
        room.forEach((socketId) => {
            users.push(socketId);
        });

        return users;
    }
}
