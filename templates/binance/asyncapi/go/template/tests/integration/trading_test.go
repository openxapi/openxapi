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

func TestNewOrderTest(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeTRADE {
			continue
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "NewOrderTest", testNewOrderTest)
		})
	}
}

func TestNewOrder(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeTRADE {
			continue
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "NewOrder", testNewOrder)
		})
	}
}

func TestOrderStatus(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeTRADE {
			continue
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "OrderStatus", testOrderStatus)
		})
	}
}

func TestCancelOrder(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeTRADE {
			continue
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "CancelOrder", testCancelOrder)
		})
	}
}

func TestCancelAllOrders(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeTRADE {
			continue
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpoint(t, config, "CancelAllOrders", testCancelAllOrders)
		})
	}
}

func TestSorOrderTest(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeTRADE {
			continue
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpointWithTimeout(t, config, "SorOrderTest", testSorOrderTest, 35*time.Second)
		})
	}
}

func TestOrderListPlaceOco(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeTRADE {
			continue
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpointWithTimeout(t, config, "OrderListPlaceOco", testOrderListPlaceOco, 20*time.Second)
		})
	}
}

func TestOrderListPlaceOto(t *testing.T) {
	for _, config := range getTestConfigs() {
		if config.AuthType != AuthTypeTRADE {
			continue
		}
		t.Run(config.Name, func(t *testing.T) {
			testEndpointWithTimeout(t, config, "OrderListPlaceOto", testOrderListPlaceOto, 20*time.Second)
		})
	}
}

// Implementation functions
func testNewOrderTest(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendOrderTest(ctx,
		models.NewOrderTestRequest().
			SetSymbol("BTCUSDT").
			SetSide("BUY").
			SetType("LIMIT").
			SetTimeInForce("GTC").
			SetQuantity("0.001").
			SetPrice("30000.00"),
		func(response *models.OrderTestResponse, err error) error {
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

func testNewOrder(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendOrderPlace(ctx,
		models.NewOrderPlaceRequest().
			SetSymbol("BTCUSDT").
			SetSide("BUY").
			SetType("LIMIT").
			SetTimeInForce("GTC").
			SetQuantity("0.001").
			SetPrice("30000.00"),
		func(response *models.OrderPlaceResponse, err error) error {
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

func testOrderStatus(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// First create an order to get an order ID
	orderChan := make(chan *models.OrderPlaceResponse, 1)
	orderErrChan := make(chan error, 1)

	err := client.SendOrderPlace(ctx,
		models.NewOrderPlaceRequest().
			SetSymbol("BTCUSDT").
			SetSide("BUY").
			SetType("LIMIT").
			SetTimeInForce("GTC").
			SetQuantity("0.001").
			SetPrice("30000.00"),
		func(response *models.OrderPlaceResponse, err error) error {
			if err != nil {
				orderErrChan <- err
			} else {
				orderChan <- response
			}
			return err
		})

	if err != nil {
		return fmt.Errorf("failed to send create order request: %w", err)
	}

	// Wait for order creation
	var orderID int64
	select {
	case response := <-orderChan:
		orderID = response.Result.OrderId
	case err := <-orderErrChan:
		return fmt.Errorf("failed to create order for status test: %w", err)
	case <-ctx.Done():
		return fmt.Errorf("create order timeout")
	}

	// Now check order status
	responseChan := make(chan error, 1)

	err = client.SendOrderStatus(ctx,
		models.NewOrderStatusRequest().
			SetSymbol("BTCUSDT").
			SetOrderId(orderID),
		func(response *models.OrderStatusResponse, err error) error {
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

func testCancelOrder(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// First create an order to cancel
	orderChan := make(chan *models.OrderPlaceResponse, 1)
	orderErrChan := make(chan error, 1)

	err := client.SendOrderPlace(ctx,
		models.NewOrderPlaceRequest().
			SetSymbol("BTCUSDT").
			SetSide("BUY").
			SetType("LIMIT").
			SetTimeInForce("GTC").
			SetQuantity("0.001").
			SetPrice("30000.00"),
		func(response *models.OrderPlaceResponse, err error) error {
			if err != nil {
				orderErrChan <- err
			} else {
				orderChan <- response
			}
			return err
		})

	if err != nil {
		return fmt.Errorf("failed to send create order request: %w", err)
	}

	// Wait for order creation
	var orderID int64
	select {
	case response := <-orderChan:
		orderID = response.Result.OrderId
	case err := <-orderErrChan:
		return fmt.Errorf("failed to create order for cancel test: %w", err)
	case <-ctx.Done():
		return fmt.Errorf("create order timeout")
	}

	// Now cancel the order
	responseChan := make(chan error, 1)

	err = client.SendOrderCancel(ctx,
		models.NewOrderCancelRequest().
			SetSymbol("BTCUSDT").
			SetOrderId(orderID),
		func(response *models.OrderCancelResponse, err error) error {
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

func testCancelAllOrders(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendOpenOrdersCancelAll(ctx,
		models.NewOpenOrdersCancelAllRequest().SetSymbol("BTCUSDT"),
		func(response *models.OpenOrdersCancelAllResponse, err error) error {
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

func testSorOrderTest(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// First get exchange info to check for SOR symbols
	exchangeInfoChan := make(chan *models.ExchangeInfoResponse, 1)
	exchangeInfoErrChan := make(chan error, 1)

	err := client.SendExchangeInfo(ctx, models.NewExchangeInfoRequest(),
		func(response *models.ExchangeInfoResponse, err error) error {
			if err != nil {
				exchangeInfoErrChan <- err
			} else {
				exchangeInfoChan <- response
			}
			return err
		})

	if err != nil {
		return fmt.Errorf("failed to send exchange info request: %w", err)
	}

	// Wait for exchange info
	var hasSORS bool
	select {
	case response := <-exchangeInfoChan:
		hasSORS = len(response.Result.Sors) > 0
	case err := <-exchangeInfoErrChan:
		return fmt.Errorf("failed to get exchange info for SOR test: %w", err)
	case <-ctx.Done():
		return fmt.Errorf("exchange info timeout")
	}

	if !hasSORS {
		// This is expected - SOR is not available on testnet, so we skip this test
		// by returning nil (success) since this is not actually a failure
		return nil
	}

	// If we get here, SOR is available, so test it
	responseChan := make(chan error, 1)

	ctx, cancel = context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	err = client.SendSorOrderTest(ctx,
		models.NewSorOrderTestRequest().
			SetSymbol("BTCUSDT").
			SetSide("BUY").
			SetType("LIMIT").
			SetTimeInForce("GTC").
			SetQuantity(0.001).
			SetPrice(30000.00),
		func(response *models.SorOrderTestResponse, err error) error {
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

func testOrderListPlaceOco(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// Get current price for proper OCO order setup
	currentPrice, err := getCurrentPrice(client, "BTCUSDT")
	if err != nil {
		return fmt.Errorf("failed to get ticker price for OCO: %w", err)
	}

	// For buy OCO: limit price must be below current price, stop price must be above
	limitPrice := fmt.Sprintf("%.2f", currentPrice*0.95) // 5% below current
	stopPrice := fmt.Sprintf("%.2f", currentPrice*1.05)  // 5% above current

	responseChan := make(chan error, 1)

	err = client.SendOrderListPlaceOco(ctx,
		models.NewOrderListPlaceOcoRequest().
			SetSymbol("BTCUSDT").
			SetSide("BUY").
			SetQuantity("0.001").
			SetAboveType("STOP_LOSS_LIMIT").
			SetAboveStopPrice(stopPrice).
			SetAbovePrice(limitPrice).
			SetAboveTimeInForce("GTC").
			SetBelowType("LIMIT_MAKER").
			SetBelowPrice(limitPrice),
		func(response *models.OrderListPlaceOcoResponse, err error) error {
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

func testOrderListPlaceOto(client *spotws.Client, config TestConfig) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	responseChan := make(chan error, 1)

	err := client.SendOrderListPlaceOto(ctx,
		models.NewOrderListPlaceOtoRequest().
			SetSymbol("BTCUSDT").
			SetWorkingType("LIMIT").
			SetWorkingSide("BUY").
			SetWorkingQuantity("0.001").
			SetWorkingPrice("30000.00").
			SetWorkingTimeInForce("GTC").
			SetPendingType("LIMIT").
			SetPendingSide("SELL").
			SetPendingQuantity("0.001").
			SetPendingPrice("35000.00").
			SetPendingTimeInForce("GTC"),
		func(response *models.OrderListPlaceOtoResponse, err error) error {
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
