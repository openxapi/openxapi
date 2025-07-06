//go:build ignore

package wstest

import (
	"context"
	"fmt"
	"testing"
	"time"

	spotws "github.com/openxapi/binance-go/ws/spot"
	"github.com/openxapi/binance-go/ws/spot/models"
)

func TestSessionLogon(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.KeyType != KeyTypeED25519 {
			continue // SessionLogon requires Ed25519 keys only
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "SessionLogon", testSessionLogon)
		})
	}
}

func TestSessionStatus(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeUSER_DATA {
			continue // Skip non-USER_DATA configs - session status is a USER_DATA endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "SessionStatus", testSessionStatus)
		})
	}
}

func TestSessionLogout(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeUSER_DATA {
			continue // Skip non-USER_DATA configs - session logout is a USER_DATA endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "SessionLogout", testSessionLogout)
		})
	}
}

func TestUserDataStreamStart(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeTRADE {
			continue // Only test for TRADE configs
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "UserDataStreamStart", testUserDataStreamStart)
		})
	}
}

func TestUserDataStreamPing(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeTRADE {
			continue
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "UserDataStreamPing", testUserDataStreamPing)
		})
	}
}

func TestUserDataStreamStop(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeTRADE {
			continue
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "UserDataStreamStop", testUserDataStreamStop)
		})
	}
}

func TestUserDataStreamSubscribe(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.KeyType != KeyTypeED25519 || config.AuthType != AuthTypeTRADE {
			continue // Requires Ed25519 keys for session.logon
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "UserDataStreamSubscribe", testUserDataStreamSubscribe)
		})
	}
}

func TestUserDataStreamUnsubscribe(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.KeyType != KeyTypeED25519 || config.AuthType != AuthTypeTRADE {
			continue
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "UserDataStreamUnsubscribe", testUserDataStreamUnsubscribe)
		})
	}
}

func TestUserDataEventHandlers(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeTRADE {
			continue
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "UserDataEventHandlers", testUserDataEventHandlers)
		})
	}
}

// Implementation functions
func testSessionLogon(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	// Generate timestamp and signature for session logon
	timestamp := time.Now().UnixMilli()
	queryString := fmt.Sprintf("apiKey=%s&timestamp=%d", config.APIKey, timestamp)
	signature, err := generateSignature(config, queryString)
	if err != nil {
		return fmt.Errorf("failed to generate signature: %w", err)
	}

	err = client.SendSessionLogon(ctx,
		models.NewSessionLogonRequest().
			SetApiKey(config.APIKey).
			SetTimestamp(timestamp).
			SetSignature(signature),
		func(response *models.SessionLogonResponse, err error) error {
			responseChan <- err
			return err
		})

	if err != nil {
		return err
	}

	select {
	case err := <-responseChan:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func testSessionStatus(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// First perform session logon (required for session status)
	logonChan := make(chan error, 1)

	timestamp := time.Now().UnixMilli()
	queryString := fmt.Sprintf("apiKey=%s&timestamp=%d", config.APIKey, timestamp)
	signature, err := generateSignature(config, queryString)
	if err != nil {
		return fmt.Errorf("failed to generate signature for session logon: %w", err)
	}

	err = client.SendSessionLogon(ctx,
		models.NewSessionLogonRequest().
			SetApiKey(config.APIKey).
			SetTimestamp(timestamp).
			SetSignature(signature),
		func(response *models.SessionLogonResponse, err error) error {
			logonChan <- err
			return err
		})

	if err != nil {
		return fmt.Errorf("failed to send session logon request: %w", err)
	}

	// Wait for session logon
	select {
	case err := <-logonChan:
		if err != nil {
			return fmt.Errorf("session logon failed for status test: %w", err)
		}
	case <-ctx.Done():
		return fmt.Errorf("session logon timeout")
	}

	// Now check session status
	responseChan := make(chan error, 1)

	err = client.SendSessionStatus(ctx, models.NewSessionStatusRequest(),
		func(response *models.SessionStatusResponse, err error) error {
			responseChan <- err
			return err
		})

	if err != nil {
		return err
	}

	select {
	case err := <-responseChan:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func testSessionLogout(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// First perform session logon (required for session logout)
	logonChan := make(chan error, 1)

	timestamp := time.Now().UnixMilli()
	queryString := fmt.Sprintf("apiKey=%s&timestamp=%d", config.APIKey, timestamp)
	signature, err := generateSignature(config, queryString)
	if err != nil {
		return fmt.Errorf("failed to generate signature for session logon: %w", err)
	}

	err = client.SendSessionLogon(ctx,
		models.NewSessionLogonRequest().
			SetApiKey(config.APIKey).
			SetTimestamp(timestamp).
			SetSignature(signature),
		func(response *models.SessionLogonResponse, err error) error {
			logonChan <- err
			return err
		})

	if err != nil {
		return fmt.Errorf("failed to send session logon request: %w", err)
	}

	// Wait for session logon
	select {
	case err := <-logonChan:
		if err != nil {
			return fmt.Errorf("session logon failed for logout test: %w", err)
		}
	case <-ctx.Done():
		return fmt.Errorf("session logon timeout")
	}

	// Now perform session logout
	responseChan := make(chan error, 1)

	err = client.SendSessionLogout(ctx, models.NewSessionLogoutRequest(),
		func(response *models.SessionLogoutResponse, err error) error {
			responseChan <- err
			return err
		})

	if err != nil {
		return err
	}

	select {
	case err := <-responseChan:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func testUserDataStreamStart(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	startRequest := models.NewUserDataStreamStartRequest()
	startRequest.SetParams(models.UserDataStreamStartRequestParams{})

	err := client.SendUserDataStreamStart(ctx, startRequest,
		func(response *models.UserDataStreamStartResponse, err error) error {
			responseChan <- err
			return err
		})

	if err != nil {
		return err
	}

	select {
	case err := <-responseChan:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func testUserDataStreamPing(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// First get a listen key
	startChan := make(chan *models.UserDataStreamStartResponse, 1)
	startErrChan := make(chan error, 1)

	startRequest := models.NewUserDataStreamStartRequest()
	startRequest.SetParams(models.UserDataStreamStartRequestParams{})

	err := client.SendUserDataStreamStart(ctx, startRequest,
		func(response *models.UserDataStreamStartResponse, err error) error {
			if err != nil {
				startErrChan <- err
			} else {
				startChan <- response
			}
			return err
		})

	if err != nil {
		return fmt.Errorf("failed to send user data stream start request: %w", err)
	}

	// Wait for listen key
	var listenKey string
	select {
	case response := <-startChan:
		listenKey = response.Result.ListenKey
	case err := <-startErrChan:
		return fmt.Errorf("failed to get listen key: %w", err)
	case <-ctx.Done():
		return fmt.Errorf("user data stream start timeout")
	}

	// Now ping the stream
	responseChan := make(chan error, 1)

	pingRequest := models.NewUserDataStreamPingRequest()
	pingRequest.SetParams(models.UserDataStreamPingRequestParams{
		ListenKey: listenKey,
	})

	err = client.SendUserDataStreamPing(ctx, pingRequest,
		func(response *models.UserDataStreamPingResponse, err error) error {
			responseChan <- err
			return err
		})

	if err != nil {
		return err
	}

	select {
	case err := <-responseChan:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func testUserDataStreamStop(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// First get a listen key
	startChan := make(chan *models.UserDataStreamStartResponse, 1)
	startErrChan := make(chan error, 1)

	startRequest := models.NewUserDataStreamStartRequest()
	startRequest.SetParams(models.UserDataStreamStartRequestParams{})

	err := client.SendUserDataStreamStart(ctx, startRequest,
		func(response *models.UserDataStreamStartResponse, err error) error {
			if err != nil {
				startErrChan <- err
			} else {
				startChan <- response
			}
			return err
		})

	if err != nil {
		return fmt.Errorf("failed to send user data stream start request: %w", err)
	}

	// Wait for listen key
	var listenKey string
	select {
	case response := <-startChan:
		listenKey = response.Result.ListenKey
	case err := <-startErrChan:
		return fmt.Errorf("failed to get listen key: %w", err)
	case <-ctx.Done():
		return fmt.Errorf("user data stream start timeout")
	}

	// Now stop the stream
	responseChan := make(chan error, 1)

	stopRequest := models.NewUserDataStreamStopRequest()
	stopRequest.SetParams(models.UserDataStreamStopRequestParams{
		ListenKey: listenKey,
	})

	err = client.SendUserDataStreamStop(ctx, stopRequest,
		func(response *models.UserDataStreamStopResponse, err error) error {
			responseChan <- err
			return err
		})

	if err != nil {
		return err
	}

	select {
	case err := <-responseChan:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func testUserDataStreamSubscribe(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	// First perform session logon (required for subscribe/unsubscribe)
	logonChan := make(chan error, 1)

	timestamp := time.Now().UnixMilli()
	queryString := fmt.Sprintf("apiKey=%s&timestamp=%d", config.APIKey, timestamp)
	signature, err := generateSignature(config, queryString)
	if err != nil {
		return fmt.Errorf("failed to generate signature for session logon: %w", err)
	}

	err = client.SendSessionLogon(ctx,
		models.NewSessionLogonRequest().
			SetApiKey(config.APIKey).
			SetTimestamp(timestamp).
			SetSignature(signature),
		func(response *models.SessionLogonResponse, err error) error {
			logonChan <- err
			return err
		})

	if err != nil {
		return fmt.Errorf("failed to send session logon request: %w", err)
	}

	// Wait for session logon
	select {
	case err := <-logonChan:
		if err != nil {
			return fmt.Errorf("session logon failed for subscribe test: %w", err)
		}
	case <-ctx.Done():
		return fmt.Errorf("session logon timeout")
	}

	// Now get a listen key from UserDataStreamStart
	startChan := make(chan *models.UserDataStreamStartResponse, 1)
	startErrChan := make(chan error, 1)

	startRequest := models.NewUserDataStreamStartRequest()
	startRequest.SetParams(models.UserDataStreamStartRequestParams{})

	err = client.SendUserDataStreamStart(ctx, startRequest,
		func(response *models.UserDataStreamStartResponse, err error) error {
			if err != nil {
				startErrChan <- err
			} else {
				startChan <- response
			}
			return err
		})

	if err != nil {
		return fmt.Errorf("failed to send user data stream start request: %w", err)
	}

	// Wait for listen key
	select {
	case <-startChan:
		// Got listen key successfully
	case err := <-startErrChan:
		return fmt.Errorf("failed to get listen key for subscribe test: %w", err)
	case <-ctx.Done():
		return fmt.Errorf("user data stream start timeout")
	}

	// Now test subscription
	responseChan := make(chan error, 1)

	err = client.SendUserDataStreamSubscribe(ctx,
		models.NewUserDataStreamSubscribeRequest(),
		func(response *models.UserDataStreamSubscribeResponse, err error) error {
			responseChan <- err
			return err
		})

	if err != nil {
		return err
	}

	select {
	case err := <-responseChan:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func testUserDataStreamUnsubscribe(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()

	// First perform session logon (required for subscribe/unsubscribe)
	logonChan := make(chan error, 1)

	timestamp := time.Now().UnixMilli()
	queryString := fmt.Sprintf("apiKey=%s&timestamp=%d", config.APIKey, timestamp)
	signature, err := generateSignature(config, queryString)
	if err != nil {
		return fmt.Errorf("failed to generate signature for session logon: %w", err)
	}

	err = client.SendSessionLogon(ctx,
		models.NewSessionLogonRequest().
			SetApiKey(config.APIKey).
			SetTimestamp(timestamp).
			SetSignature(signature),
		func(response *models.SessionLogonResponse, err error) error {
			logonChan <- err
			return err
		})

	if err != nil {
		return fmt.Errorf("failed to send session logon request: %w", err)
	}

	// Wait for session logon
	select {
	case err := <-logonChan:
		if err != nil {
			return fmt.Errorf("session logon failed for unsubscribe test: %w", err)
		}
	case <-ctx.Done():
		return fmt.Errorf("session logon timeout")
	}

	// Now get a listen key and subscribe
	startChan := make(chan *models.UserDataStreamStartResponse, 1)
	startErrChan := make(chan error, 1)

	startRequest := models.NewUserDataStreamStartRequest()
	startRequest.SetParams(models.UserDataStreamStartRequestParams{})

	err = client.SendUserDataStreamStart(ctx, startRequest,
		func(response *models.UserDataStreamStartResponse, err error) error {
			if err != nil {
				startErrChan <- err
			} else {
				startChan <- response
			}
			return err
		})

	if err != nil {
		return fmt.Errorf("failed to send user data stream start request: %w", err)
	}

	// Wait for listen key
	select {
	case <-startChan:
		// Got listen key successfully
	case err := <-startErrChan:
		return fmt.Errorf("failed to get listen key for unsubscribe test: %w", err)
	case <-ctx.Done():
		return fmt.Errorf("user data stream start timeout")
	}

	// Subscribe first
	subscribeChan := make(chan error, 1)
	err = client.SendUserDataStreamSubscribe(ctx,
		models.NewUserDataStreamSubscribeRequest(),
		func(response *models.UserDataStreamSubscribeResponse, err error) error {
			subscribeChan <- err
			return err
		})

	if err != nil {
		return fmt.Errorf("failed to send subscribe request: %w", err)
	}

	select {
	case err := <-subscribeChan:
		if err != nil {
			return fmt.Errorf("failed to subscribe before unsubscribe test: %w", err)
		}
	case <-ctx.Done():
		return fmt.Errorf("subscribe timeout")
	}

	// Now test unsubscribe
	responseChan := make(chan error, 1)

	err = client.SendUserDataStreamUnsubscribe(ctx,
		models.NewUserDataStreamUnsubscribeRequest(),
		func(response *models.UserDataStreamUnsubscribeResponse, err error) error {
			responseChan <- err
			return err
		})

	if err != nil {
		return err
	}

	select {
	case err := <-responseChan:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func testUserDataEventHandlers(client *spotws.Client, config TestConfig) error {
	// Test event handler registrations
	client.HandleOutboundAccountPosition(func(event *models.OutboundAccountPosition) error {
		return nil
	})

	client.HandleBalanceUpdate(func(event *models.BalanceUpdate) error {
		return nil
	})

	client.HandleExecutionReport(func(event *models.ExecutionReport) error {
		return nil
	})

	client.HandleListStatus(func(event *models.ListStatus) error {
		return nil
	})

	client.HandleListenKeyExpired(func(event *models.ListenKeyExpired) error {
		return nil
	})

	client.HandleExternalLockUpdate(func(event *models.ExternalLockUpdate) error {
		return nil
	})

	client.HandleEventStreamTerminated(func(event *models.EventStreamTerminated) error {
		return nil
	})

	return nil
}
