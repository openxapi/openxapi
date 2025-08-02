import { File, Text } from '@asyncapi/generator-react-sdk';

export default function ({ asyncapi, params }) {
  const packageName = params.packageName || 'spot';
  const moduleName = params.moduleName || 'binance-websocket-client';
  const version = params.version || '0.1.0';
  const author = params.author || 'openxapi';

  return (
    <File name="auth.py">
      <Text>{`"""
Binance WebSocket Authentication

This module provides authentication utilities for the Binance WebSocket API,
supporting multiple signing methods including HMAC-SHA256, RSA, and Ed25519.

Author: ${author}
Version: ${version}
"""

import base64
import hashlib
import hmac
import os
import time
from typing import Optional, Union

try:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa, ed25519, padding
    from cryptography.hazmat.primitives.serialization import load_pem_private_key
    CRYPTO_AVAILABLE = True
except ImportError:
    CRYPTO_AVAILABLE = False


class AuthenticationError(Exception):
    """Custom exception for authentication errors"""
    pass


class BinanceAuth:
    """
    Binance API authentication handler
    
    Supports multiple authentication methods:
    - HMAC-SHA256 (default)
    - RSA signing
    - Ed25519 signing
    """
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        secret_key: Optional[str] = None,
        private_key: Optional[Union[str, bytes]] = None,
        auth_type: str = "hmac"
    ):
        """
        Initialize authentication
        
        Args:
            api_key: Binance API key
            secret_key: Secret key for HMAC signing
            private_key: Private key for RSA/Ed25519 signing (PEM format)
            auth_type: Authentication type ("hmac", "rsa", "ed25519")
        """
        self.api_key = api_key or os.getenv("BINANCE_API_KEY")
        self.secret_key = secret_key or os.getenv("BINANCE_SECRET_KEY")
        self.auth_type = auth_type.lower()
        
        if not self.api_key:
            raise AuthenticationError("API key is required")
            
        # Initialize signing key based on auth type
        if self.auth_type == "hmac":
            if not self.secret_key:
                raise AuthenticationError("Secret key is required for HMAC authentication")
            self._signing_key = self.secret_key.encode('utf-8')
            
        elif self.auth_type in ("rsa", "ed25519"):
            if not CRYPTO_AVAILABLE:
                raise AuthenticationError("cryptography library is required for RSA/Ed25519 authentication")
                
            if not private_key:
                private_key = os.getenv("BINANCE_PRIVATE_KEY")
            if not private_key:
                raise AuthenticationError(f"Private key is required for {self.auth_type.upper()} authentication")
                
            # Load private key
            if isinstance(private_key, str):
                private_key = private_key.encode('utf-8')
                
            try:
                self._signing_key = load_pem_private_key(private_key, password=None)
            except Exception as e:
                raise AuthenticationError(f"Failed to load private key: {e}")
                
            # Validate key type
            if self.auth_type == "rsa" and not isinstance(self._signing_key, rsa.RSAPrivateKey):
                raise AuthenticationError("RSA private key required for RSA authentication")
            elif self.auth_type == "ed25519" and not isinstance(self._signing_key, ed25519.Ed25519PrivateKey):
                raise AuthenticationError("Ed25519 private key required for Ed25519 authentication")
                
        else:
            raise AuthenticationError(f"Unsupported authentication type: {self.auth_type}")

    def sign(self, message: str) -> str:
        """
        Sign a message using the configured authentication method
        
        Args:
            message: Message to sign (usually query string)
            
        Returns:
            Base64-encoded signature
        """
        if self.auth_type == "hmac":
            return self._sign_hmac(message)
        elif self.auth_type == "rsa":
            return self._sign_rsa(message)
        elif self.auth_type == "ed25519":
            return self._sign_ed25519(message)
        else:
            raise AuthenticationError(f"Unsupported authentication type: {self.auth_type}")

    def _sign_hmac(self, message: str) -> str:
        """Sign message using HMAC-SHA256"""
        signature = hmac.new(
            self._signing_key,
            message.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        return signature

    def _sign_rsa(self, message: str) -> str:
        """Sign message using RSA"""
        if not CRYPTO_AVAILABLE:
            raise AuthenticationError("cryptography library not available")
            
        signature = self._signing_key.sign(
            message.encode('utf-8'),
            padding.PKCS1v15(),
            hashes.SHA256()
        )
        return base64.b64encode(signature).decode('utf-8')

    def _sign_ed25519(self, message: str) -> str:
        """Sign message using Ed25519"""
        if not CRYPTO_AVAILABLE:
            raise AuthenticationError("cryptography library not available")
            
        signature = self._signing_key.sign(message.encode('utf-8'))
        return base64.b64encode(signature).decode('utf-8')

    def create_signed_params(self, params: dict) -> dict:
        """
        Create signed parameters for API request
        
        Args:
            params: Request parameters
            
        Returns:
            Parameters with signature, timestamp, and apiKey added
        """
        # Start with a copy of the original params
        signed_params = params.copy()
        
        # Add apiKey - MUST be included in signature payload (matches Go implementation)
        signed_params['apiKey'] = self.api_key
        
        # Add timestamp if not present
        if 'timestamp' not in signed_params:
            signed_params['timestamp'] = int(time.time() * 1000)
            
        # Create query string for signing - includes apiKey and timestamp
        # Sort parameters alphabetically for consistent signature generation
        sorted_params = sorted(signed_params.items())
        query_string = '&'.join([f"{k}={v}" for k, v in sorted_params])
        
        # Sign the query string (includes apiKey + timestamp + other params)
        signature = self.sign(query_string)
        
        # Add signature to parameters
        signed_params['signature'] = signature
        
        return signed_params

    def get_headers(self) -> dict:
        """
        Get authentication headers
        
        Returns:
            Dictionary of headers to include in requests
        """
        return {
            'X-MBX-APIKEY': self.api_key
        }

    @classmethod
    def from_env(cls, auth_type: str = "hmac") -> 'BinanceAuth':
        """
        Create authentication from environment variables
        
        Environment variables:
        - BINANCE_API_KEY: API key
        - BINANCE_SECRET_KEY: Secret key (for HMAC)
        - BINANCE_PRIVATE_KEY: Private key (for RSA/Ed25519)
        
        Args:
            auth_type: Authentication type ("hmac", "rsa", "ed25519")
            
        Returns:
            Configured BinanceAuth instance
        """
        return cls(auth_type=auth_type)

    def __repr__(self) -> str:
        return f"BinanceAuth(auth_type='{self.auth_type}', api_key='***')"


# Utility functions for key generation and validation
def generate_rsa_keypair(key_size: int = 2048) -> tuple:
    """
    Generate RSA key pair for testing
    
    Args:
        key_size: RSA key size in bits
        
    Returns:
        Tuple of (private_key_pem, public_key_pem)
    """
    if not CRYPTO_AVAILABLE:
        raise AuthenticationError("cryptography library not available")
        
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=key_size
    )
    
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )
    
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    )
    
    return private_pem.decode('utf-8'), public_pem.decode('utf-8')


def generate_ed25519_keypair() -> tuple:
    """
    Generate Ed25519 key pair for testing
    
    Returns:
        Tuple of (private_key_pem, public_key_pem)
    """
    if not CRYPTO_AVAILABLE:
        raise AuthenticationError("cryptography library not available")
        
    private_key = ed25519.Ed25519PrivateKey.generate()
    
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )
    
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    )
    
    return private_pem.decode('utf-8'), public_pem.decode('utf-8')


def validate_signature(message: str, signature: str, secret_key: str) -> bool:
    """
    Validate HMAC signature
    
    Args:
        message: Original message
        signature: Signature to validate
        secret_key: Secret key
        
    Returns:
        True if signature is valid
    """
    expected = hmac.new(
        secret_key.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(signature, expected)


# Example usage and testing
if __name__ == "__main__":
    import os
    
    # Example with HMAC authentication
    try:
        auth = BinanceAuth(
            api_key="test_api_key",
            secret_key="test_secret_key",
            auth_type="hmac"
        )
        
        # Test signing
        test_params = {"symbol": "BTCUSDT", "side": "BUY", "type": "MARKET", "quantity": "0.001"}
        signed_params = auth.create_signed_params(test_params)
        print(f"Signed parameters: {signed_params}")
        
        # Validate signature
        query_string = '&'.join([f"{k}={v}" for k, v in sorted(test_params.items())])
        is_valid = validate_signature(query_string, signed_params['signature'], "test_secret_key")
        print(f"Signature valid: {is_valid}")
        
    except Exception as e:
        print(f"HMAC test failed: {e}")
    
    # Example with RSA authentication (if cryptography is available)
    if CRYPTO_AVAILABLE:
        try:
            private_key_pem, public_key_pem = generate_rsa_keypair()
            print("Generated RSA key pair for testing")
            
            auth_rsa = BinanceAuth(
                api_key="test_api_key",
                private_key=private_key_pem,
                auth_type="rsa"
            )
            
            signature = auth_rsa.sign("test message")
            print(f"RSA signature: {signature[:50]}...")
            
        except Exception as e:
            print(f"RSA test failed: {e}")
    else:
        print("Cryptography library not available - RSA/Ed25519 authentication not supported")
`}</Text>
    </File>
  );
}