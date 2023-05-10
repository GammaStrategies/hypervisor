interface IOracle {
	function getTimepoints(uint32[] memory secondsAgos) external view returns (int56[] memory tickCumulatives, uint112[] memory volatilityCumulatives);
}
