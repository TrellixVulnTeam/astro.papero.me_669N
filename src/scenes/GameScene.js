import * as Phaser from "phaser";
import {colors, gameDimensions, sceneKeys} from "../constants/constants";
import websocketEvents from "../constants/websocketEvents";

export default class GameScene extends Phaser.Scene {

    constructor(socket, game) {
        super({key: sceneKeys.game});

        this.socket = socket;
        this.settings = game.settings;
        this.currentPlayer = game.currentPlayer;
        this.maxVelocityLittle = game.settings.velocity+0.5;

        this.players = {};
        game.players.forEach(player => {
            this.players[player.localId] = player;
            this.players[player.localId].availableBullets = 3;
        });

        this.normalizers = {
            velocity: 100,
            angularVelocity: Math.PI/1200,
            reloadingVelocity: 1/2000,
            bulletVelocity: 200
        }
    }

    preload(){

        colors.forEach((value, index) => {
            this.load.image("ship"+index, require("@/assets/ships/ship"+index+".png"));
        });
        this.textures.addBase64("bullet", require("@/assets/bullet.png"));

    }

    create(){

        this.shipsGroup = this.physics.add.group();
        this.bulletsGroup = this.physics.add.group();

        this.setupNewShips();

        this.socket.on(websocketEvents.MOVE_BIG, this.onBigMoved);
        this.socket.on(websocketEvents.MOVE_LITTLE, this.onLittleMoved);
        this.socket.on(websocketEvents.SHOOT, this.createBullet);
        this.socket.on(websocketEvents.CHANGE_STATE, this.updateState);
        this.socket.on(websocketEvents.RELOAD, this.reload);

        this.rotationKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.input.keyboard.on("keyup-ENTER", this.shoot);

        this.physics.add.collider(this.shipsGroup, this.bulletsGroup, this.onCollision);
    }

    update(time, delta){
        if(this.rotationKey.isDown) this.moveBig(delta);
    }

    getVelocity(angle, mag){
        return {
            x: Math.cos(angle)*mag,
            y: Math.sin(angle)*mag
        }
    }

    setupNewShips(){
        this.players.getKeys().forEach((key, index) => {
            this.players[key].ship = this.physics.add.image(
                ( Math.sign(index-1.5) / 2 + 1 ) * gameDimensions.width,
                ( index % 2 ) * gameDimensions.height,
                "ship"+this.players[key].color
            );
            this.players[key].ship.rotation = -Math.PI / 4  * ( index < 2 ? 1 : 3) * ( ( index % 2 ) * 2 - 1 );
            let {x, y} = this.getVelocity(this.players[key].ship.rotation, this.settings.velocity*this.normalizers.velocity);
            this.players[key].ship.setVelocity(x, y);
            this.players[key].ship.setCollideWorldBounds(true);
            this.players[key].ship.localId = key;
            this.shipsGroup.add(this.players[key].ship);
        });
    }

    onBigMoved(data){
        this.players[data.localId].ship.setPosition(data.position.x, data.position.y);
        this.players[data.localId].ship.setRotation(data.rotation);
        let {x, y} = this.getVelocity(data.rotation, this.settings.velocity * this.normalizers.velocity);
        this.players[data.localId].ship.setVelocity(x, y);
    }

    moveBig(delta){
        this.players[this.currentPlayer].ship.rotation += delta * this.settings.angularVelocity * this.normalizers.angularVelocity;
        let {x, y} = this.getVelocity(
            this.players[this.currentPlayer].ship.rotation,
            this.settings.velocity * this.normalizers.velocity
        );
        this.players[this.currentPlayer].ship.setVelocity(x, y);
        this.socket.emit(websocketEvents.MOVE_BIG, {
            localId: this.currentPlayer,
            rotation: this.players[this.currentPlayer].ship.rotation,
            position: {
                x: this.players[this.currentPlayer].ship.x,
                y: this.players[this.currentPlayer].ship.y
            }
        });
    }


    onLittleMoved(data){
        this.players[data.localId].ship.setPosition(data.position.x, data.position.y);
        this.players[data.localId].ship.setRotation(data.rotation);
        let {x, y} = this.getVelocity(data.rotation, this.maxVelocityLittle*this.normalizers.velocity);
        this.players[data.localId].ship.setMaxVelocity(x, y);
        this.players[data.localId].ship.setAcceleration(data.acceleration.x, data.acceleration.y);
    }

    moveLittle(){

    }


    createBullet(data){
        let bullet = this.physics.add.image(data.position.x, data.position.y, "bullet");
        bullet.rotation = data.rotation;
        let {x, y} = this.getVelocity(data.rotation, this.settings.bulletVelocity*this.normalizers.bulletVelocity);
        bullet.setVelocity(x, y);
        bullet.shotBy = data.localId;
        this.bulletsGroup.add(bullet);
        this.players[data.localId].availableBullets--;
    }

    shoot(){
        if(this.players[this.currentPlayer].availableBullets>0){
            let ship = this.players[this.currentPlayer].ship;
            let angle = ship.rotation;
            let data = {
                position: {
                    x: ship.x + ship.width*Math.cos(angle),
                    y: ship.y + ship.width*Math.sin(angle)
                },
                rotation: angle,
                localId: this.currentPlayer
            };
            this.socket.emit(websocketEvents.SHOOT, data);
            this.createBullet(data);
        }
    }


    updateState(data){
        this.players[data.localId].state = data.state;
    }

    onCollision(ship, bullet){
        bullet.destroy();
        ship.destroy();
        /*this.socket.emit(websocketEvents.CHANGE_STATE, {
            localId: ship.localId,
            state: --this.players[ship.localId].state
        })*/
    }


    reload(data){
        this.players[data.localId].availableBullets = data.availableBullets;
    }


}