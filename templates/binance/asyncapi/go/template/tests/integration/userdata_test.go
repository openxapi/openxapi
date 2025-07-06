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

func TestAccount(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeUSER_DATA {
			continue // Skip non-USER_DATA configs - account is a USER_DATA endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "Account", testAccount)
		})
	}
}

func TestAccountCommission(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeUSER_DATA {
			continue // Skip non-USER_DATA configs - account commission is a USER_DATA endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "AccountCommission", testAccountCommission)
		})
	}
}

func TestMyTrades(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeUSER_DATA {
			continue // Skip non-USER_DATA configs - my trades is a USER_DATA endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "MyTrades", testMyTrades)
		})
	}
}

func TestAllOrders(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeUSER_DATA {
			continue // Skip non-USER_DATA configs - all orders is a USER_DATA endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "AllOrders", testAllOrders)
		})
	}
}

func TestOpenOrders(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeUSER_DATA {
			continue // Skip non-USER_DATA configs - open orders is a USER_DATA endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "OpenOrders", testOpenOrders)
		})
	}
}

func TestOrderRateLimit(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeUSER_DATA {
			continue // Skip non-USER_DATA configs - order rate limit is a USER_DATA endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "OrderRateLimit", testOrderRateLimit)
		})
	}
}

func TestMyAllocations(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeUSER_DATA {
			continue // Skip non-USER_DATA configs - my allocations is a USER_DATA endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "MyAllocations", testMyAllocations)
		})
	}
}

func TestTradesRecent(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeUSER_DATA {
			continue // Skip non-USER_DATA configs - recent trades is a USER_DATA endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "TradesRecent", testTradesRecent)
		})
	}
}

func TestAllOrderLists(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeUSER_DATA {
			continue // Skip non-USER_DATA configs - all order lists is a USER_DATA endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "AllOrderLists", testAllOrderLists)
		})
	}
}

func TestOpenOrderListsStatus(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeUSER_DATA {
			continue // Skip non-USER_DATA configs - open order lists status is a USER_DATA endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "OpenOrderListsStatus", testOpenOrderListsStatus)
		})
	}
}

func TestOrderAmendments(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeUSER_DATA {
			continue // Skip non-USER_DATA configs - order amendments is a USER_DATA endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "OrderAmendments", testOrderAmendments)
		})
	}
}

func TestMyPreventedMatches(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeUSER_DATA {
			continue // Skip non-USER_DATA configs - my prevented matches is a USER_DATA endpoint
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "MyPreventedMatches", testMyPreventedMatches)
		})
	}
}

// Implementation functions
func testAccount(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendAccountStatus(ctx, models.NewAccountStatusRequest(),
		func(response *models.AccountStatusResponse, err error) error {
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

func testAccountCommission(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendAccountCommission(ctx,
		models.NewAccountCommissionRequest().SetSymbol("BTCUSDT"),
		func(response *models.AccountCommissionResponse, err error) error {
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

func testMyTrades(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendMyTrades(ctx,
		models.NewMyTradesRequest().
			SetSymbol("BTCUSDT").
			SetLimit(100),
		func(response *models.MyTradesResponse, err error) error {
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

func testAllOrders(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendAllOrders(ctx,
		models.NewAllOrdersRequest().
			SetSymbol("BTCUSDT").
			SetLimit(100),
		func(response *models.AllOrdersResponse, err error) error {
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

func testOpenOrders(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendOpenOrdersStatus(ctx,
		models.NewOpenOrdersStatusRequest().SetSymbol("BTCUSDT"),
		func(response *models.OpenOrdersStatusResponse, err error) error {
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

func testOrderRateLimit(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendAccountRateLimitsOrders(ctx, models.NewAccountRateLimitsOrdersRequest(),
		func(response *models.AccountRateLimitsOrdersResponse, err error) error {
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

func testMyAllocations(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendMyAllocations(ctx,
		models.NewMyAllocationsRequest().
			SetSymbol("BTCUSDT").
			SetLimit(100),
		func(response *models.MyAllocationsResponse, err error) error {
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

func testTradesRecent(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendTradesRecent(ctx,
		models.NewTradesRecentRequest().
			SetSymbol("BTCUSDT").
			SetLimit(100),
		func(response *models.TradesRecentResponse, err error) error {
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

func testAllOrderLists(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendAllOrderLists(ctx,
		models.NewAllOrderListsRequest().SetLimit(100),
		func(response *models.AllOrderListsResponse, err error) error {
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

func testOpenOrderListsStatus(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendOpenOrderListsStatus(ctx, models.NewOpenOrderListsStatusRequest(),
		func(response *models.OpenOrderListsStatusResponse, err error) error {
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

func testOrderAmendments(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendOrderAmendments(ctx,
		models.NewOrderAmendmentsRequest().
			SetSymbol("BTCUSDT").
			SetLimit(100),
		func(response *models.OrderAmendmentsResponse, err error) error {
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

func testMyPreventedMatches(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// First get recent orders to find an order ID for prevented matches query
	ordersChan := make(chan *models.AllOrdersResponse, 1)
	ordersErrChan := make(chan error, 1)

	err := client.SendAllOrders(ctx,
		models.NewAllOrdersRequest().
			SetSymbol("BTCUSDT").
			SetLimit(10),
		func(response *models.AllOrdersResponse, err error) error {
			if err != nil {
				ordersErrChan <- err
			} else {
				ordersChan <- response
			}
			return err
		})

	if err != nil {
		return fmt.Errorf("failed to get orders for prevented matches test: %w", err)
	}

	// Wait for orders response
	var orderId int64
	select {
	case response := <-ordersChan:
		if len(response.Result) > 0 {
			orderId = response.Result[0].OrderId
		} else {
			// No orders found, skip the test gracefully
			return fmt.Errorf("no orders found to test prevented matches - this is expected on testnet")
		}
	case err := <-ordersErrChan:
		return fmt.Errorf("failed to get orders for prevented matches test: %w", err)
	case <-ctx.Done():
		return fmt.Errorf("get orders timeout for prevented matches test")
	}

	// Now query prevented matches with the order ID
	responseChan := make(chan error, 1)

	err = client.SendMyPreventedMatches(ctx,
		models.NewMyPreventedMatchesRequest().
			SetSymbol("BTCUSDT").
			SetOrderId(orderId).
			SetLimit(100),
		func(response *models.MyPreventedMatchesResponse, err error) error {
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
