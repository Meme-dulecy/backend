import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Socket, Server } from 'socket.io';
import { EventType } from './datatypes/type/event.type';
import { GpsBody, GpsData } from './datatypes/interface/gps.interface';
import { MemeService } from 'MEME/meme.service';
import getDistance from 'gps-distance';
import { socketMap } from 'COMMON/const/socketMap.const';
import { verify } from 'jsonwebtoken';

@WebSocketGateway(8001, { transports: ['websocket'], cors: true })
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
        const VALUE_IDX = 1;
        await Promise.all(
            Array.from(socketMap).map(async targetData => {
                const userMap = new Map();
                const socketId = targetData[0];
                const [long1, lat1] = targetData[VALUE_IDX].location;
                const userIds = Array.from(socketMap)
                    .filter(socketData => {
                        if (!socketData[VALUE_IDX].userId) return false;
                        const [long2, lat2] = socketData[VALUE_IDX].location;
                        const distance = getDistance(lat1, long1, lat2, long2);
                        if (distance <= 50) {
                            userMap.set(socketData[VALUE_IDX].userId, distance);
                            return true;
                        } else {
                            return false;
                        }
                    })
                    .map(v => v[VALUE_IDX].userId);
                const memes = await this.memeService.findByUserIds(userIds);
                this.server.to(socketId).emit(
                    EventType.SEND_MEMES,
                    memes.map(meme => ({ ...meme, distance: 1000 * userMap.get(meme.creator) })),
                );
            }),
        );
    };
}
