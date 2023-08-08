import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Socket, Server } from 'socket.io';
import { EventType } from './datatypes/type/event.type';
import { GpsBody, GpsData } from './datatypes/interface/gps.interface';
import { MemeService } from 'MEME/meme.service';
import getDistance from 'gps-distance';
import { socketMap } from 'COMMON/const/socketMap.const';
import { verify } from 'jsonwebtoken';
import { pipe, map, toArray, filter, each } from '@fxts/core';

@WebSocketGateway({ transports: ['websocket'], cors: true })
export class EventsGateway {
  private logger = new Logger('Gateway');
  @WebSocketServer()
  server: Server;

  constructor(private readonly memeService: MemeService) {}

  handleConnection(@ConnectedSocket() socket: Socket) {
    this.logger.log(`💛 ${socket.id} 소켓 연결 💛`);
  }

  handleDisconnect(@ConnectedSocket() socket: Socket) {
    socketMap.delete(socket.id);
    this.logger.log(`💛 ${socket.id} 소켓 연결 해제 💛`);
  }

  @SubscribeMessage(EventType.SEND_GPS)
  async handleGPSMessage(@ConnectedSocket() socket: Socket, @MessageBody() gps: GpsBody) {
    const data: GpsData = { location: [gps.long, gps.lat] };

    if (gps.token) {
      const decoded: { userId: string } = verify(gps.token, process.env.JWT_KEY);
      data.userId = decoded.userId;
    }

    this.logger.log(`💜 ${socket.id} gps 정보 전송 [ lat: ${gps.lat} / long: ${gps.long} ] 💜`);
    socketMap.set(socket.id, data);

    await this.resendMemes();
  }

  @SubscribeMessage(EventType.CREATE_MEME)
  async handleMemeMessage() {
    await this.resendMemes();
  }

  private resendMemes = async () => {
    const sendMemesTo = async targetSocket => {
      const [socketId, { location: targetLocation }] = targetSocket;

      const usersInDistance = Array.from(socketMap)
        .filter(([_, { userId }]) => userId)
        .filter(([_, { location }]) => {
          const [long1, lat1] = targetLocation;
          const [long2, lat2] = location;
          const distance = getDistance(lat1, long1, lat2, long2);
          const isInDistance = distance <= 50;

          return isInDistance;
        });

      const distanceMap = new Map();
      pipe(
        usersInDistance,
        each(([_, { userId, location }]) => {
          const [long1, lat1] = targetLocation;
          const [long2, lat2] = location;
          const distance = getDistance(lat1, long1, lat2, long2) as GpsData;

          distanceMap.set(userId, distance);
        }),
      );

      const memes = await pipe(
        usersInDistance,
        map(([_, { userId }]) => userId),
        toArray,
        this.memeService.findByUserIds,
        map(meme => ({ ...meme, distance: 1000 * distanceMap.get(meme.creator) })),
        toArray,
      );

      this.server.to(socketId).emit(EventType.SEND_MEMES, memes);
    };

    pipe(socketMap, each(sendMemesTo));
  };
}
