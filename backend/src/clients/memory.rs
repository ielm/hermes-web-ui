use tonic::transport::Channel;
use crate::error::Result;

// TODO: These will be generated from proto files
pub mod memory_proto {
    tonic::include_proto!("hermes.memory.v1");
}

use memory_proto::memory_service_client::MemoryServiceClient;

pub struct MemoryClient {
    client: MemoryServiceClient<Channel>,
}

impl MemoryClient {
    pub async fn new(url: &str) -> Result<Self> {
        let channel = Channel::from_shared(url.to_string())
            .expect("Invalid URL")
            .connect()
            .await?;
        
        let client = MemoryServiceClient::new(channel);
        Ok(Self { client })
    }

    pub async fn store(&self, request: StoreRequest) -> Result<StoreResponse> {
        let response = self.client
            .clone()
            .store(request)
            .await?;
        Ok(response.into_inner())
    }

    pub async fn search(&self, request: SearchRequest) -> Result<SearchResponse> {
        let response = self.client
            .clone()
            .search(request)
            .await?;
        Ok(response.into_inner())
    }

    pub async fn query(&self, request: QueryRequest) -> Result<QueryResponse> {
        let response = self.client
            .clone()
            .query(request)
            .await?;
        Ok(response.into_inner())
    }
}

// Placeholder types until proto generation
#[derive(Debug, Clone)]
pub struct StoreRequest {
    pub namespace: String,
    pub content: String,
    pub metadata: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone)]
pub struct StoreResponse {
    pub id: String,
    pub success: bool,
}

#[derive(Debug, Clone)]
pub struct SearchRequest {
    pub namespace: String,
    pub query: String,
    pub limit: i32,
}

#[derive(Debug, Clone)]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
}

#[derive(Debug, Clone)]
pub struct SearchResult {
    pub id: String,
    pub content: String,
    pub score: f32,
    pub metadata: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone)]
pub struct QueryRequest {
    pub namespace: String,
    pub omni_query: String,
}

#[derive(Debug, Clone)]
pub struct QueryResponse {
    pub results: Vec<serde_json::Value>,
    pub execution_time_ms: i64,
}