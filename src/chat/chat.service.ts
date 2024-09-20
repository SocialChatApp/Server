import { Injectable } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';

import { Server, Socket } from 'socket.io';


@WebSocketGateway({
    cors: {
        origin: '*',
    }
})
@Injectable()
export class ChatService implements OnGatewayConnection, OnGatewayDisconnect {

    private userRooms: Map<string, Set<string>> = new Map();

    @WebSocketServer() server: Server;

    handleConnection(client: Socket) {
        console.log('Client connected:', client.id);
        this.userRooms.set(client.id, new Set());
        //client.emit("roomList", this.fetchActiveRooms());
    }


    handleDisconnect(client: Socket) {
        console.log('Client disconnected:', client.id);
        const rooms = this.userRooms.get(client.id);

        if (rooms) {
            rooms.forEach(roomName => {
                client.leave(roomName);
                this.server.to(roomName).emit('user-left', client.id);
            });

            // Kullanıcıyı odalardan kaldır
            this.userRooms.delete(client.id);
        }

        this.server.emit("roomList", this.fetchActiveRooms());
    }

    @SubscribeMessage('getRooms')
    handleGetRooms(client: Socket): void {
        // İstemciden oda listesini istediğinde
        client.emit('roomList', this.fetchActiveRooms());
    }

    @SubscribeMessage('createRoom')
    handleCreateRoom(client: Socket, roomName: string): void {
        client.join(roomName);
        console.log("Client joined" + client.id);
        this.server.emit("roomList", this.fetchActiveRooms());

        //Odayı oluşturan kullanıcıya bilgiler gönderiyoruz
        this.SendRoomInfo(client.id, roomName);
    }

    @SubscribeMessage('joinRoom')
    handleJoinRoom(client: Socket, roomName: string): void {

        // Odaya katıl
        client.join(roomName);
        const userRooms = this.userRooms.get(client.id) || new Set();
        userRooms.add(roomName);
        this.userRooms.set(client.id, userRooms);

        this.SendRoomInfo(client.id, roomName);
        client.to(roomName).emit('NewUserJoined', client.id);
    }


    @SubscribeMessage('leave-room')
    handleLeaveRoom(client: Socket, roomName: string): void {

        client.leave(roomName);


        const userRooms = this.userRooms.get(client.id);
        if (userRooms) {
            userRooms.delete(roomName);
        }

        client.to(roomName).emit('user-left', client.id);
        this.server.emit("roomList", this.fetchActiveRooms());
    }

    @SubscribeMessage('message')
    handleMessage(client: Socket, payload: { roomName: string, sender: string, message: string }): void {

        console.log(`You have a message from this ${payload.roomName} room by ${client.id}`);

        this.server.to(payload.roomName).emit('message', {
            sender: payload.sender,
            message: payload.message
        })

    }


    SendRoomInfo(socketId: string, roomName: string) {
        const users = this.getAllUsers(roomName);

        const roomInfo = {
            roomName,
            users
        }

        this.server.to(socketId).emit('roomInfo', roomInfo);
    }


    fetchActiveRooms(): string[] {
        const roomsMap = this.server.of("/").adapter.rooms;

        const roomsArray = Array.from(roomsMap.keys());

        // İsterseniz socket'lerin kendi odalarını filtreleyebilirsiniz
        const sids = this.server.of("/").adapter.sids;
        const filteredRoomsArray = roomsArray.filter(room => !sids.has(room));
        return filteredRoomsArray;
    }

    getAllUsers(roomName: string): string[] {

        const room = this.server.of("/").adapter.rooms.get(roomName);
        if (!room) {
            return []; // Oda yoksa boş dizi döndür
        }

        const users: string[] = [];
        room.forEach((socketId) => {
            // Her bir socket ID için kullanıcıyı ekle
            users.push(socketId);
        });

        return users;
    }
}
