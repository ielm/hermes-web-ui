use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
};
use futures::{sink::SinkExt, stream::StreamExt};
use serde::{Deserialize, Serialize};
use tracing::{error, info};

use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
struct WsMessage {
    #[serde(rename = "type")]
    msg_type: String,
    execution_id: Option<String>,
    data: Option<serde_json::Value>,
}

pub async fn handle_websocket(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| websocket_handler(socket, state))
}

async fn websocket_handler(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();

    // Spawn a task to handle incoming messages
    let state_clone = state.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(msg) = receiver.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                        match ws_msg.msg_type.as_str() {
                            "subscribe" => {
                                if let Some(execution_id) = ws_msg.execution_id {
                                    info!("Client subscribed to execution: {}", execution_id);
                                    // TODO: Subscribe to execution logs via Redis pub/sub
                                }
                            }
                            "unsubscribe" => {
                                if let Some(execution_id) = ws_msg.execution_id {
                                    info!("Client unsubscribed from execution: {}", execution_id);
                                    // TODO: Unsubscribe from execution logs
                                }
                            }
                            _ => {
                                error!("Unknown message type: {}", ws_msg.msg_type);
                            }
                        }
                    }
                }
                Ok(Message::Close(_)) => {
                    info!("Client disconnected");
                    break;
                }
                Err(e) => {
                    error!("WebSocket error: {}", e);
                    break;
                }
                _ => {}
            }
        }
    });

    // Spawn a task to send execution logs
    let mut send_task = tokio::spawn(async move {
        // TODO: Subscribe to Redis pub/sub for execution logs
        // For now, send a heartbeat every 30 seconds
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
        
        loop {
            interval.tick().await;
            
            let heartbeat = WsMessage {
                msg_type: "heartbeat".to_string(),
                execution_id: None,
                data: Some(serde_json::json!({
                    "timestamp": chrono::Utc::now().to_rfc3339(),
                })),
            };
            
            if let Ok(json) = serde_json::to_string(&heartbeat) {
                if sender.send(Message::Text(json)).await.is_err() {
                    break;
                }
            }
        }
    });

    // Wait for either task to finish
    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    }

    info!("WebSocket connection closed");
}