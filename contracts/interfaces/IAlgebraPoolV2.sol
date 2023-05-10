// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

interface IAlgebraPoolV2 {
	function token0() external view returns(address);
	function token1() external view returns(address);
	function tickSpacing() external view returns(int24);
	function burn(int24, int24, uint128) external returns(uint256,uint256); 
	function mint(address, address, int24, int24, uint128, bytes calldata) external returns(uint256,uint256,uint128); 
	function collect(address, int24, int24, uint128, uint128) external returns(uint256,uint256); 
	function positions(bytes32) external view returns(uint256, uint256, uint256, uint128, uint128);
	function globalState() external view returns(uint160, int24, uint16, uint16, uint16, uint8, bool);
  function dataStorageOperator() external view returns (address);
}
